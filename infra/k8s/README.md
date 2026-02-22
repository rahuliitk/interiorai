# Kubernetes Manifests

Kubernetes deployment manifests for InteriorAI production infrastructure.

## Structure

```
k8s/
├── base/           # Base manifests (deployments, services, configmaps)
├── overlays/
│   ├── staging/    # Staging-specific patches
│   └── production/ # Production-specific patches
└── README.md
```

Uses Kustomize for environment-specific configuration.

## Status

Not yet implemented — Docker Compose used for local development.
