import { Injectable } from '@nestjs/common';
import { OpenAIProvider } from '../common/openai.provider';

@Injectable()
export class SpiderService {
  constructor(private readonly openaiProvider: OpenAIProvider) {}

  private get openai() { return this.openaiProvider.client; }

  async analyzeCompetitor(url: string, name: string) {
    // In a real scenario, this would use Puppeteer/Playwright to scrape the URL.
    // Here we simulate the scraped content or use AI to hallucinate/infer based on known data if it's a big brand.

    // Mock scraped data for "Global Top 1" demo
    const mockScrapedData = `
      Competitor: ${name}
      URL: ${url}
      Detected Pricing: High tier ($97/mo), Low tier ($27/mo).
      Main Headline: "The best solution for X".
      Weaknesses: Slow support, complex UI.
    `;

    if (!this.openai)
      return {
        analysis: mockScrapedData,
        strategy: 'Manual analysis required',
      };

    const prompt = `
    Analyze this competitor data and generate a "Kill Strategy" for my SaaS.
    
    Data:
    ${mockScrapedData}
    
    Output JSON:
    {
      "weaknesses": ["Weakness 1", "Weakness 2"],
      "counter_arguments": ["Arg 1", "Arg 2"],
      "suggested_offer": "Create an offer that..."
    }
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  }
}
