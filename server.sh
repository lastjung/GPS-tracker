#!/bin/bash

# 1. 경로 설정 (범용 표준)
PID_DIR="node_modules/.cache"
PID_FILE="$PID_DIR/dev-server.pid"

# 2. 실행 중인 서버 종료 함수
stop_server() {
    PID=$(cat "$PID_FILE")
    # 프로세스가 실제로 존재하고 쉘 프로세스인지 다시 확인하는 보완 로직
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping Server (PID: $PID)..."
        # 자식 프로세스까지 포함하여 종료 시도 (pgid 사용 권장하나 기본 kill 우선)
        kill "$PID"
        sleep 1
        # 강제 종료가 필요한 경우 대비
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID"
        fi
        rm -f "$PID_FILE"
        echo "Server stopped."
        exit 0
    else
        echo "Stale PID file found. Removing..."
        rm -f "$PID_FILE"
    fi
}

# 3. 메인 로직: 이미 실행 중이면 종료(Toggle)
if [ -f "$PID_FILE" ]; then
    stop_server
fi

# 4. 서버 시작 및 클린업 설정
mkdir -p "$PID_DIR"
echo "Starting GPS-Tracker Server (Vite)..."

# 종료 시 PID 파일 삭제 트리거
trap 'rm -f "$PID_FILE"; exit' INT TERM EXIT

# PID 기록 (서브쉘 실행 방지를 위해 실행 직전에 기록)
echo $$ > "$PID_FILE"

# 5. 서버 가동 (pnpm dev 실행)
pnpm run dev
