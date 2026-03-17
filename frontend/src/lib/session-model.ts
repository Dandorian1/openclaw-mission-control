export type SessionModelFields = {
  model?: string | null;
  model_name?: string | null;
  modelOverride?: string | null;
  model_override?: string | null;
  modelId?: string | null;
  model_id?: string | null;
  modelProvider?: string | null;
  model_provider?: string | null;
  provider?: string | null;
  providerOverride?: string | null;
  provider_override?: string | null;
};

const normalize = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

const composeProviderModel = (
  provider: string | null,
  model: string | null,
): string | null => {
  if (!model) return null;
  if (model.includes("/")) return model;
  return provider ? `${provider}/${model}` : model;
};

export const resolveSessionModelDisplay = (fields: SessionModelFields): string | null => {
  const providerOverride = normalize(fields.providerOverride) ?? normalize(fields.provider_override);
  const modelOverride =
    normalize(fields.modelOverride) ??
    normalize(fields.model_override) ??
    normalize(fields.modelId) ??
    normalize(fields.model_id);
  const provider =
    providerOverride ??
    normalize(fields.modelProvider) ??
    normalize(fields.model_provider) ??
    normalize(fields.provider);
  const model =
    modelOverride ??
    normalize(fields.model) ??
    normalize(fields.model_name);

  return composeProviderModel(provider, model);
};
