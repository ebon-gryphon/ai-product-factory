# Run both halves of the factory workspace before publishing.
check: backend-check frontend-check

backend-check:
    cd AionCore && bash scripts/migration/check-immutability.test.sh
    cd AionCore && bash scripts/migration/check-immutability.sh
    cd AionCore && cargo fmt --all -- --check
    cd AionCore && cargo clippy --workspace -- -D warnings
    cd AionCore && cargo test --workspace

frontend-check:
    cd AionUi && just lint-strict fmt-check typecheck i18n-check test

push *ARGS: check
    git push {{ARGS}}
