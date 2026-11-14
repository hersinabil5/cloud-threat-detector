# Build first: cd ../lambda && GOOS=linux GOARCH=arm64 go build -o bootstrap .
data "archive_file" "lambda" {
  type        = "zip"
  source_file = "${path.module}/../lambda/bootstrap"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/aws/lambda/threat-detector-ingest"
  retention_in_days = 7
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "ingest" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.logs.arn}/*"]
  }
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.ingest.arn}:*"]
  }
}

resource "aws_iam_role" "ingest" {
  name               = "threat-detector-ingest"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy" "ingest" {
  role   = aws_iam_role.ingest.id
  policy = data.aws_iam_policy_document.ingest.json
}

resource "aws_lambda_function" "ingest" {
  function_name    = "threat-detector-ingest"
  role             = aws_iam_role.ingest.arn
  runtime          = "provided.al2023"
  architectures    = ["arm64"]
  handler          = "bootstrap"
  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  memory_size      = 256
  timeout          = 30

  environment {
    variables = { DATABASE_URL = var.database_url }
  }

  depends_on = [aws_cloudwatch_log_group.ingest]
}

resource "aws_lambda_permission" "s3" {
  statement_id   = "AllowS3Invoke"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.ingest.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.logs.arn
  source_account = local.account_id
}

resource "aws_s3_bucket_notification" "logs" {
  bucket = aws_s3_bucket.logs.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.ingest.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "AWSLogs/${local.account_id}/CloudTrail/"
  }

  depends_on = [aws_lambda_permission.s3]
}
