FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full feature langgraph directory as a package
COPY . ./src/features/bizzie_chat/agent/

# Create __init__.py stubs so Python treats the directories as packages
RUN touch src/__init__.py \
    && touch src/features/__init__.py \
    && touch src/features/bizzie_chat/__init__.py

EXPOSE 8080

CMD ["uvicorn", "src.features.bizzie_chat.agent.main:app", "--host", "0.0.0.0", "--port", "8080"]
