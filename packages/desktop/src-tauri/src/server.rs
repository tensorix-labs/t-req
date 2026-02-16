use std::time::Duration;

const HEALTH_PATH: &str = "/health";
const HEALTH_RETRIES: usize = 30;
const HEALTH_BASE_BACKOFF_MS: u64 = 100;
const HEALTH_REQUEST_TIMEOUT: Duration = Duration::from_secs(2);

pub async fn check_health(base_url: &str, token: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(HEALTH_REQUEST_TIMEOUT)
        .no_proxy()
        .build()
        .map_err(|e| format!("failed to construct health-check client: {e}"))?;

    let health_url = format!("{base_url}{HEALTH_PATH}");
    let mut last_error = "health check failed".to_string();

    for attempt in 0..HEALTH_RETRIES {
        match client.get(&health_url).bearer_auth(token).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(response) => {
                last_error = format!(
                    "health check returned unexpected status {} at {}",
                    response.status(),
                    health_url
                );
            }
            Err(error) => {
                last_error = format!("health check request failed at {health_url}: {error}");
            }
        }

        if attempt + 1 < HEALTH_RETRIES {
            let delay_ms = HEALTH_BASE_BACKOFF_MS * (attempt as u64 + 1);
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
    }

    Err(last_error)
}
