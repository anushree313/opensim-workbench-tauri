use std::sync::{Arc, Mutex};
use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A job submitted to the local or remote scheduler.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: Uuid,
    pub name: String,
    pub status: JobStatus,
    pub submitted_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub progress: f64,
    pub log_messages: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl Job {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            status: JobStatus::Queued,
            submitted_at: Utc::now(),
            started_at: None,
            completed_at: None,
            progress: 0.0,
            log_messages: Vec::new(),
        }
    }
}

/// Local job queue manager.
#[derive(Debug, Default)]
pub struct JobManager {
    pub jobs: Vec<Job>,
    pub max_concurrent: usize,
}

impl JobManager {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            jobs: Vec::new(),
            max_concurrent,
        }
    }

    pub fn submit(&mut self, job: Job) -> Uuid {
        let id = job.id;
        self.jobs.push(job);
        id
    }

    pub fn get_job(&self, id: Uuid) -> Option<&Job> {
        self.jobs.iter().find(|j| j.id == id)
    }

    pub fn running_count(&self) -> usize {
        self.jobs
            .iter()
            .filter(|j| j.status == JobStatus::Running)
            .count()
    }

    pub fn get_job_mut(&mut self, id: Uuid) -> Option<&mut Job> {
        self.jobs.iter_mut().find(|j| j.id == id)
    }

    pub fn all_jobs(&self) -> &[Job] {
        &self.jobs
    }
}

/// Thread-safe async job executor.
/// Spawns solver tasks on background threads and tracks their completion.
pub struct AsyncJobExecutor {
    /// Shared job results storage.
    results: Arc<Mutex<HashMap<Uuid, JobResult>>>,
}

/// Result of an async job.
#[derive(Debug, Clone)]
pub enum JobResult {
    Pending,
    Running,
    Completed(String), // serialized result as JSON
    Failed(String),    // error message
}

impl AsyncJobExecutor {
    pub fn new() -> Self {
        Self {
            results: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Submit a task to run on a background thread.
    /// The task_fn should return Ok(json_result) or Err(error_message).
    pub fn submit<F>(&self, job_id: Uuid, task_fn: F)
    where
        F: FnOnce() -> Result<String, String> + Send + 'static,
    {
        let results = self.results.clone();
        results.lock().unwrap().insert(job_id, JobResult::Running);

        std::thread::spawn(move || {
            let result = match task_fn() {
                Ok(json) => JobResult::Completed(json),
                Err(e) => JobResult::Failed(e),
            };
            results.lock().unwrap().insert(job_id, result);
        });
    }

    /// Poll the status of an async job.
    pub fn poll(&self, job_id: Uuid) -> Option<JobResult> {
        self.results.lock().ok()?.get(&job_id).cloned()
    }

    /// Take the completed result (removes it from storage).
    pub fn take_result(&self, job_id: Uuid) -> Option<JobResult> {
        self.results.lock().ok()?.remove(&job_id)
    }
}

impl Default for AsyncJobExecutor {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================
// Remote HPC Cluster Interface
// ============================================================

/// Cluster scheduler type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ClusterScheduler {
    SLURM,
    PBS,
    LSF,
    Local,
}

/// Configuration for a remote HPC cluster.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteCluster {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub scheduler: ClusterScheduler,
    pub work_dir: String,
}

/// A job submitted to a remote cluster.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteJob {
    pub id: Uuid,
    pub cluster_name: String,
    pub status: JobStatus,
    pub submit_script: String,
    pub remote_job_id: Option<String>,
    pub submitted_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

/// Manages remote HPC cluster connections and job submissions.
#[derive(Debug, Default)]
pub struct HpcManager {
    pub clusters: Vec<RemoteCluster>,
    pub remote_jobs: Vec<RemoteJob>,
}

impl HpcManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a remote cluster configuration.
    pub fn add_cluster(&mut self, cluster: RemoteCluster) {
        self.clusters.push(cluster);
    }

    /// Get all registered clusters.
    pub fn get_clusters(&self) -> &[RemoteCluster] {
        &self.clusters
    }

    /// Generate a SLURM/PBS submit script for a solver job.
    pub fn generate_submit_script(
        &self,
        cluster: &RemoteCluster,
        job_name: &str,
        num_cores: u32,
        memory_gb: u32,
        walltime_hours: u32,
        solver_command: &str,
    ) -> String {
        match cluster.scheduler {
            ClusterScheduler::SLURM => format!(
                "#!/bin/bash\n\
                 #SBATCH --job-name={job_name}\n\
                 #SBATCH --ntasks={num_cores}\n\
                 #SBATCH --mem={memory_gb}G\n\
                 #SBATCH --time={walltime_hours}:00:00\n\
                 #SBATCH --output={job_name}_%j.out\n\
                 #SBATCH --error={job_name}_%j.err\n\
                 \n\
                 cd {work_dir}\n\
                 {solver_command}\n",
                work_dir = cluster.work_dir,
            ),
            ClusterScheduler::PBS => format!(
                "#!/bin/bash\n\
                 #PBS -N {job_name}\n\
                 #PBS -l nodes=1:ppn={num_cores}\n\
                 #PBS -l mem={memory_gb}gb\n\
                 #PBS -l walltime={walltime_hours}:00:00\n\
                 #PBS -o {job_name}.out\n\
                 #PBS -e {job_name}.err\n\
                 \n\
                 cd {work_dir}\n\
                 {solver_command}\n",
                work_dir = cluster.work_dir,
            ),
            ClusterScheduler::LSF => format!(
                "#!/bin/bash\n\
                 #BSUB -J {job_name}\n\
                 #BSUB -n {num_cores}\n\
                 #BSUB -M {memory_mb}\n\
                 #BSUB -W {walltime_hours}:00\n\
                 #BSUB -o {job_name}_%J.out\n\
                 #BSUB -e {job_name}_%J.err\n\
                 \n\
                 cd {work_dir}\n\
                 {solver_command}\n",
                memory_mb = memory_gb * 1024,
                work_dir = cluster.work_dir,
            ),
            ClusterScheduler::Local => format!(
                "#!/bin/bash\n\
                 cd {work_dir}\n\
                 {solver_command}\n",
                work_dir = cluster.work_dir,
            ),
        }
    }

    /// Submit a job to a remote cluster (generates script, marks as pending).
    /// Note: Actual SSH execution requires the `ssh2` crate (future work).
    pub fn submit_remote_job(
        &mut self,
        cluster_name: &str,
        job_name: &str,
        solver_command: &str,
    ) -> Option<Uuid> {
        let cluster = self.clusters.iter().find(|c| c.name == cluster_name)?.clone();
        let script = self.generate_submit_script(&cluster, job_name, 4, 8, 1, solver_command);

        let job = RemoteJob {
            id: Uuid::new_v4(),
            cluster_name: cluster_name.to_string(),
            status: JobStatus::Queued,
            submit_script: script,
            remote_job_id: None,
            submitted_at: Utc::now(),
            completed_at: None,
        };
        let id = job.id;
        self.remote_jobs.push(job);
        Some(id)
    }

    /// Get all remote jobs.
    pub fn get_remote_jobs(&self) -> &[RemoteJob] {
        &self.remote_jobs
    }

    /// Poll a remote job status (stub — would use SSH in production).
    pub fn poll_remote_job(&self, job_id: Uuid) -> Option<&RemoteJob> {
        self.remote_jobs.iter().find(|j| j.id == job_id)
    }

    /// Cancel a remote job (stub).
    pub fn cancel_remote_job(&mut self, job_id: Uuid) -> bool {
        if let Some(job) = self.remote_jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = JobStatus::Cancelled;
            true
        } else {
            false
        }
    }
}
