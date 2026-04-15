import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Load .env then .env.local (override) — ensures keys are available in standalone mode/Studio
load_dotenv()
load_dotenv(".env.local", override=True)


@dataclass(frozen=True)
class BizzieChatConfig:
    gcp_project: str = os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT", "")
    gcp_location: str = os.environ.get("GCP_LOCATION", "us-central1")

    model_pro: str = os.environ.get("LLM_MODEL_PRO", "gemini-3.1-pro-preview")
    model_flash: str = os.environ.get("LLM_MODEL_FLASH", "gemini-3-flash-preview")
    model_flash_lite: str = os.environ.get("LLM_MODEL_FLASH_LITE", "gemini-3.1-flash-lite-preview")

    max_tokens_guardian: int = int(os.environ.get("MAX_TOKENS_GUARDIAN", "150"))
    max_tokens_response: int = int(os.environ.get("MAX_TOKENS_RESPONSE", "1500"))
    max_tokens_ambassador: int = int(os.environ.get("MAX_TOKENS_AMBASSADOR", "1200"))
    max_tokens_follow_up: int = int(os.environ.get("MAX_TOKENS_FOLLOW_UP", "200"))

    vertex_api_endpoint: str = "https://aiplatform.googleapis.com"
    fmp_api_key: str = os.environ.get("FMP_API_KEY", "")
    fmp_mcp_base: str = "https://financialmodelingprep.com/mcp"
    tavily_api_key: str = os.environ.get("TAVILY_API_KEY", "")
    redis_url: str = os.environ.get("REDIS_URL", "")
    redis_ca_cert: str = os.environ.get("REDIS_CA_CERT", "")

    circuit_breaker_collection: str = "circuitBreaker"
    circuit_breaker_doc: str = "fmp"
    conversations_collection: str = "conversations"

    circuit_breaker_failure_threshold: int = 3
    circuit_breaker_window_seconds: int = 120
    circuit_breaker_cooldown_seconds: int = 60

    fmp_agent_max_tool_cycles: int = 5
    ambassador_fmp_timeout_seconds: int = 8
    fmp_retry_attempts: int = 1

    env: str = os.environ.get("ENV", "production")

    langsmith_api_key: str = os.environ.get("LANGSMITH_API_KEY", "")
    langsmith_project: str = os.environ.get("LANGSMITH_PROJECT", "bizzie-chat")

    @property
    def fmp_mcp_url(self) -> str:
        """FMP MCP server URL with API key appended.

        Intentionally a @property rather than a field so it is excluded from
        dataclass serialization (e.g. asdict(), logging) and the API key is
        never captured in logs or traces.
        """
        return f"{self.fmp_mcp_base}?apikey={self.fmp_api_key}"


config = BizzieChatConfig()
