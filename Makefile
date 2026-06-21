.PHONY: help dev down build test tf-init tf-plan tf-apply creds bootstrap deploy lint

REGION ?= us-central1
PROJECT ?= my-gcp-project
CLUSTER ?= tier3-gke

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

dev: ## Run the full stack locally with docker compose
	docker compose up --build

down: ## Tear down the local stack
	docker compose down -v

test: ## Run backend tests
	cd app/backend && npm install && npm test

build: ## Build both images locally
	docker build -t tier3-backend app/backend
	docker build -t tier3-frontend app/frontend

tf-init: ## terraform init
	cd terraform && terraform init

tf-plan: ## terraform plan
	cd terraform && terraform plan

tf-apply: ## terraform apply
	cd terraform && terraform apply

creds: ## Fetch kubeconfig for the GKE cluster
	gcloud container clusters get-credentials $(CLUSTER) --region $(REGION) --project $(PROJECT)

bootstrap: ## Install platform add-ons (ingress, TLS, monitoring, logging, argocd)
	bash scripts/bootstrap-platform.sh

deploy: ## Render & apply the production overlay directly (non-GitOps path)
	kubectl apply -k k8s/overlays/production

lint: ## Validate kustomize overlays
	kubectl kustomize k8s/overlays/staging > /dev/null && echo "staging OK"
	kubectl kustomize k8s/overlays/production > /dev/null && echo "production OK"
