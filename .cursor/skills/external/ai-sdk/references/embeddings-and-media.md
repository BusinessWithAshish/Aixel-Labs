# Embeddings & Media Generation

## Embeddings

```ts
import { embed, embedMany, cosineSimilarity } from 'ai';
const { embedding } = await embed({ model: 'openai/text-embedding-3-small', value: 'text' });
const { embeddings } = await embedMany({ model: 'openai/text-embedding-3-small', values: ['a','b'] });
const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
// Settings: maxRetries, abortSignal, headers, maxParallelCalls (embedMany), providerOptions
// Returns: embedding (number[]), usage.tokens, response (raw)
```

Embedding middleware: `wrapEmbeddingModel({ model, middleware: defaultEmbeddingSettingsMiddleware({settings}) })`

Popular embedding models: OpenAI `text-embedding-3-large` (3072d), `text-embedding-3-small` (1536d), Google `gemini-embedding-001` (3072d), Mistral `mistral-embed` (1024d).

## Image Generation

```ts
import { generateImage } from 'ai';
const { image } = await generateImage({ model: openai.image('dall-e-3'), prompt: '...' });
// image.base64, image.uint8Array, image.blob()
// generateImage returns: images[] for multiple, warnings
// Options: n (count), size, aspectRatio, seed, providerOptions
```

## Transcription

```ts
import { transcribe } from 'ai';
const { text, segments, language, durationInSeconds } = await transcribe({
  model: openai.transcription('whisper-1'),
  audio: new Uint8Array(audioData),
  // providerOptions for language, prompt, etc.
});
```

## Speech (TTS)

```ts
import { generateSpeech } from 'ai';
const { audio } = await generateSpeech({ model: openai.speech('tts-1'), text: '...' });
// audio.uint8Array, audio.blob()
```
