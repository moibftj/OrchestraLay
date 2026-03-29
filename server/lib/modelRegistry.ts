// modelRegistry.ts — 6 models, pricing per 1K tokens, task type rankings

export type ModelId =
  | 'claude-3-5-sonnet'
  | 'claude-3-haiku'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'perplexity-sonar-large'
  | 'perplexity-sonar-small'

export type TaskType = 'code_generation' | 'debugging' | 'refactoring' | 'analysis' | 'review'
export type Provider = 'anthropic' | 'openai' | 'perplexity'

export type ModelSpec = {
  id: ModelId
  provider: Provider
  inputCostPer1k: number   // USD per 1K input tokens
  outputCostPer1k: number  // USD per 1K output tokens
  maxConcurrent: number
  contextWindow: number
  rankings: Record<TaskType, number> // lower = better
}

export const MODEL_REGISTRY: Record<ModelId, ModelSpec> = {
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    inputCostPer1k: 0.003,
    outputCostPer1k: 0.015,
    maxConcurrent: 5,
    contextWindow: 200000,
    rankings: {
      code_generation: 1,
      debugging: 1,
      refactoring: 1,
      analysis: 2,
      review: 1,
    },
  },
  'claude-3-haiku': {
    id: 'claude-3-haiku',
    provider: 'anthropic',
    inputCostPer1k: 0.00025,
    outputCostPer1k: 0.00125,
    maxConcurrent: 10,
    contextWindow: 200000,
    rankings: {
      code_generation: 4,
      debugging: 4,
      refactoring: 4,
      analysis: 5,
      review: 4,
    },
  },
  'gpt-4o': {
    id: 'gpt-4o',
    provider: 'openai',
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.01,
    maxConcurrent: 5,
    contextWindow: 128000,
    rankings: {
      code_generation: 2,
      debugging: 2,
      refactoring: 2,
      analysis: 1,
      review: 2,
    },
  },
  'gpt-4o-mini': {
    id: 'gpt-4o-mini',
    provider: 'openai',
    inputCostPer1k: 0.00015,
    outputCostPer1k: 0.0006,
    maxConcurrent: 10,
    contextWindow: 128000,
    rankings: {
      code_generation: 5,
      debugging: 5,
      refactoring: 5,
      analysis: 4,
      review: 5,
    },
  },
  'perplexity-sonar-large': {
    id: 'perplexity-sonar-large',
    provider: 'perplexity',
    inputCostPer1k: 0.001,
    outputCostPer1k: 0.001,
    maxConcurrent: 5,
    contextWindow: 127000,
    rankings: {
      code_generation: 6,
      debugging: 6,
      refactoring: 6,
      analysis: 3,
      review: 6,
    },
  },
  'perplexity-sonar-small': {
    id: 'perplexity-sonar-small',
    provider: 'perplexity',
    inputCostPer1k: 0.0002,
    outputCostPer1k: 0.0002,
    maxConcurrent: 10,
    contextWindow: 127000,
    rankings: {
      code_generation: 6,
      debugging: 6,
      refactoring: 6,
      analysis: 6,
      review: 6,
    },
  },
}

export const ALL_MODELS = Object.values(MODEL_REGISTRY)

export function getModel(id: ModelId): ModelSpec {
  const model = MODEL_REGISTRY[id]
  if (!model) throw new Error(`Unknown model: ${id}`)
  return model
}

export function estimateCostCents(
  model: ModelSpec,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (inputTokens / 1000) * model.inputCostPer1k
  const outputCost = (outputTokens / 1000) * model.outputCostPer1k
  return Math.ceil((inputCost + outputCost) * 100)
}
