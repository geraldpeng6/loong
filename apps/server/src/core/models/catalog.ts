import { getModels, getProviders } from "@mariozechner/pi-ai";

const formatProviderName = (id: string) =>
  id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

export const getBuiltinProviderCatalog = () => {
  try {
    const providers = getProviders();
    return providers.map((providerId) => {
      const models = getModels(providerId).map((model) => ({
        id: model.id,
        name: model.name || model.id,
        provider: model.provider || providerId,
        api: model.api,
        baseUrl: model.baseUrl,
        reasoning: model.reasoning ?? false,
        input: model.input ?? ["text"],
        contextWindow: model.contextWindow ?? null,
        maxTokens: model.maxTokens ?? null,
        cost: model.cost ?? null,
        compat: model.compat ?? null,
      }));
      return {
        id: providerId,
        name: formatProviderName(providerId),
        description: null,
        models,
      };
    });
  } catch (err) {
    console.warn(`[loong] failed to load built-in providers: ${err.message}`);
    return [];
  }
};
