resource "aws_secretsmanager_secret" "backend_runtime" {
  name                    = "${local.name_prefix}/backend/runtime"
  description             = "Runtime application secrets for the ${local.name_prefix} backend ECS service."
  recovery_window_in_days = 0

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backend-runtime-secret"
  })
}

data "aws_iam_policy_document" "ecs_task_execution_backend_runtime_secret" {
  statement {
    sid    = "ReadBackendRuntimeSecret"
    effect = "Allow"
    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue"
    ]
    resources = [aws_secretsmanager_secret.backend_runtime.arn]
  }
}

resource "aws_iam_role_policy" "ecs_task_execution_backend_runtime_secret" {
  name   = "${local.name_prefix}-ecs-exec-backend-runtime-secret"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_task_execution_backend_runtime_secret.json
}
