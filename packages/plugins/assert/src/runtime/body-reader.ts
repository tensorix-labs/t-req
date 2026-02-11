export function createBodyReader(response: Response): {
  getText(): Promise<string>;
  getJson(): Promise<{ value?: unknown; error?: string }>;
} {
  let textLoaded = false;
  let textValue = '';
  let jsonLoaded = false;
  let jsonValue: unknown;
  let jsonError: string | undefined;

  return {
    async getText(): Promise<string> {
      if (textLoaded) return textValue;
      textLoaded = true;
      textValue = await response.clone().text();
      return textValue;
    },

    async getJson(): Promise<{ value?: unknown; error?: string }> {
      if (jsonLoaded) {
        return jsonError ? { error: jsonError } : { value: jsonValue };
      }

      jsonLoaded = true;
      const text = await this.getText();
      try {
        jsonValue = JSON.parse(text);
      } catch (err) {
        jsonError = err instanceof Error ? err.message : String(err);
      }
      return jsonError ? { error: jsonError } : { value: jsonValue };
    }
  };
}
