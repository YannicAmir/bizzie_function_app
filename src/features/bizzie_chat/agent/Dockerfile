FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./src/features/bizzie_chat/agent/

RUN mkdir -p src/features/bizzie_chat/agent && \
    touch src/__init__.py \
    && touch src/features/__init__.py \
    && touch src/features/bizzie_chat/__init__.py

EXPOSE 8080

CMD ["uvicorn", "src.features.bizzie_chat.agent.main:app", "--host", "0.0.0.0", "--port", "8080"]
