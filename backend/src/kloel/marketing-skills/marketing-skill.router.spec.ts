import { MarketingSkillRouter } from './marketing-skill.router';

describe('MarketingSkillRouter', () => {
  let router: MarketingSkillRouter;

  beforeEach(() => {
    router = new MarketingSkillRouter();
  });

  it('routes checkout conversion drops to CRO frameworks', () => {
    const hits = router.route(
      'Minha conversão de checkout caiu e a página está abandonando no formulário',
    );

    expect(hits.map((entry) => entry.id)).toEqual(expect.arrayContaining(['page-cro', 'form-cro']));
  });

  it('routes launch requests to launch and lifecycle skills', () => {
    const hits = router.route(
      'Vou lançar meu curso semana que vem e preciso do aquecimento por email',
    );

    expect(hits.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['launch-strategy', 'email-sequence']),
    );
  });

  it('routes paid media diagnostics to ads and creative skills', () => {
    const hits = router.route('Meu ROAS caiu nas Meta Ads e preciso revisar criativo e audiência');

    expect(hits.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['paid-ads', 'ad-creative']),
    );
  });
});
