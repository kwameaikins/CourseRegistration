import Anthropic from '@anthropic-ai/sdk';

// The model rewrites narration; it never decides what the video shows. Each
// step arrives with `does` — a factual description of the actions the recorder
// is about to perform — and the model may only phrase that for a listener.
// This is what keeps generated tutorials from describing buttons that do not
// exist, which is the failure mode that makes AI-generated product video
// worthless.

const SYSTEM = `You write voice-over narration for short product tutorial videos for Knowsia, a Ghanaian professional-training provider.

You are given the steps of a screen recording. Each step has an "action" field describing exactly what happens on screen, and a "draft" line written by a human.

Rules:
- Return exactly one line per step, keyed by the step id.
- Each line must describe ONLY what the "action" field says happens. Never mention a button, field, screen, price, or feature that does not appear in the action text.
- 10 to 22 words. It is read aloud over the action, so it must fit.
- Second person, present tense, plain spoken English. British spelling.
- Write for the ear: no symbols, abbreviations, or slashes. Spell them out.
- Neutral and instructional. No marketing language, no exclamation marks, no "simply" or "just".
- Keep the draft's meaning. Improve rhythm and consistency across steps; do not add information.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
};

function textOf(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function parseLines(raw) {
  const fenced = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(fenced ? fenced[0] : raw);
}

export async function generateNarration({ flow, featureNote }) {
  const client = new Anthropic();

  const payload = {
    video_title: flow.title,
    feature_note: featureNote || null,
    steps: flow.steps.map((step) => ({
      id: step.id,
      action: step.does,
      draft: step.narrate,
    })),
  };

  const request = {
    model: 'claude-opus-5',
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          'Write the narration for this walkthrough. Return JSON matching the schema.\n\n' +
          JSON.stringify(payload, null, 2),
      },
    ],
  };

  let parsed;
  try {
    const response = await client.messages.create({
      ...request,
      // Constrained decoding, so there is no JSON to repair downstream.
      // effort is low deliberately: this is a short, tightly-specified
      // rewrite, not a reasoning task.
      output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'low' },
    });
    parsed = parseLines(textOf(response));
  } catch (err) {
    // Older SDK builds may not forward output_config. Falling back to a plain
    // request keeps the pipeline working rather than failing the whole build
    // over a response-format detail.
    console.warn(`  structured output unavailable (${err.message}); retrying unconstrained`);
    const response = await client.messages.create({
      ...request,
      messages: [
        {
          role: 'user',
          content:
            request.messages[0].content +
            '\n\nRespond with JSON only, shaped as {"lines":[{"id":"...","text":"..."}]}.',
        },
      ],
    });
    parsed = parseLines(textOf(response));
  }

  const byId = new Map(parsed.lines.map((line) => [line.id, line.text.trim()]));
  return flow.steps.map((step) => ({
    id: step.id,
    // A step the model skipped keeps its human draft rather than going silent.
    text: byId.get(step.id) || step.narrate,
    source: byId.has(step.id) ? 'model' : 'draft',
  }));
}
