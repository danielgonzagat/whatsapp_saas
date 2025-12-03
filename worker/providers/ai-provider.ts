import OpenAI from "openai";

/**
 * =====================================================================
 * AI PROVIDER — WRAPPER SIMPLIFICADO
 * =====================================================================
 */
export class AIProvider {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    model: string = "gpt-4o"
  ): Promise<string> {
    return this.generateChatResponse([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ], model);
  }

  // Backward compat helper used by some processors
  async generateText(prompt: string, model: string = "gpt-4o"): Promise<string> {
    const msg = await this.generateChatResponse([
      { role: "user", content: prompt }
    ], model);
    return (msg as any)?.content || "";
  }

  async generateChatResponse(
    messages: { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: any[]; tool_call_id?: string }[],
    model: string = "gpt-4o",
    tools?: any[]
  ): Promise<any> {
    try {
      const params: any = {
        messages: messages as any,
        model: model,
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = "auto";
      }

      const completion = await this.openai.chat.completions.create(params);
      return completion.choices[0].message;
    } catch (error) {
      console.error("Erro na AI:", error);
      throw error;
    }
  }
}
