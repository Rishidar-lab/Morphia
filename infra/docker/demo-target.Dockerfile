FROM python:3.11-slim

WORKDIR /app
COPY apps/demo-target/server.py .

EXPOSE 9000

HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:9000/health').status==200 else 1)"

CMD ["python", "server.py"]
