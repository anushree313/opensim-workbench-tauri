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
