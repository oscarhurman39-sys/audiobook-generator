<script lang="ts">
  /**
   * Voice audition.
   *
   * Kokoro ships 27 English voices whose IDs encode accent and gender, and
   * whose quality varies between them. A flat dropdown of raw IDs gives a
   * listener no way to choose; this groups them by accent, names them, and lets
   * each one be heard before it is committed to a book.
   */
  import {
    groupVoicesByAccent,
    GENDER_LABELS,
    type VoiceId,
    type VoiceInfo,
  } from '../lib/kokoro/kokoroVoices'
  import { getVoicePreview, VOICE_PREVIEW_TEXT } from '../lib/services/voicePreviewService'
  import { toastStore } from '../stores/toastStore'
  import { selectedQuantization, selectedDevice } from '../stores/ttsStore'
  import logger from '../lib/utils/logger'
  import { onDestroy } from 'svelte'

  interface Props {
    /** Currently selected voice, if any. */
    selected?: string
    /** Called when the listener commits to a voice. */
    onselect: (voice: VoiceId) => void
    onclose?: () => void
    /** Shown on the confirm button, e.g. the book title. */
    scopeLabel?: string
  }

  let { selected, onselect, onclose, scopeLabel }: Props = $props()

  const groups = groupVoicesByAccent()

  let previewing = $state<string | null>(null)
  let loadingPreview = $state<string | null>(null)
  let choice = $state<string | undefined>(selected)

  let audio: HTMLAudioElement | null = null
  let audioUrl: string | null = null

  function stopPreview() {
    if (audio) {
      audio.pause()
      audio.onended = null
      audio.onerror = null
      audio = null
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      audioUrl = null
    }
    previewing = null
  }

  async function playPreview(voice: VoiceInfo) {
    if (previewing === voice.id) {
      stopPreview()
      return
    }

    stopPreview()
    loadingPreview = voice.id

    try {
      const blob = await getVoicePreview(voice.id, {
        quantization: $selectedQuantization,
        device: $selectedDevice,
      })

      // The listener may have moved on while the model was generating.
      if (loadingPreview !== voice.id) return

      audioUrl = URL.createObjectURL(blob)
      audio = new Audio(audioUrl)
      audio.onended = () => stopPreview()
      audio.onerror = () => {
        toastStore.error(`Could not play the ${voice.name} preview`)
        stopPreview()
      }

      previewing = voice.id
      await audio.play()
    } catch (err) {
      logger.warn('[VoiceAudition] Preview failed', err)
      toastStore.error(`Could not generate the ${voice.name} preview`)
      stopPreview()
    } finally {
      if (loadingPreview === voice.id) loadingPreview = null
    }
  }

  function confirm() {
    if (!choice) return
    stopPreview()
    onselect(choice as VoiceId)
  }

  onDestroy(stopPreview)
</script>

<div class="audition">
  <header>
    <div>
      <h3>Choose a voice</h3>
      <p class="sample">“{VOICE_PREVIEW_TEXT}”</p>
    </div>
    {#if onclose}
      <button class="close" onclick={onclose} aria-label="Close voice picker">✕</button>
    {/if}
  </header>

  {#each groups as group (group.accent)}
    <section class="group">
      <h4>{group.label}</h4>
      <ul>
        {#each group.voices as voice (voice.id)}
          <li>
            <label class="voice" class:chosen={choice === voice.id}>
              <input
                type="radio"
                name="voice"
                value={voice.id}
                checked={choice === voice.id}
                onchange={() => (choice = voice.id)}
              />
              <span class="name">{voice.name}</span>
              <span class="gender">{GENDER_LABELS[voice.gender]}</span>
            </label>

            <button
              class="preview"
              class:playing={previewing === voice.id}
              onclick={() => playPreview(voice)}
              disabled={loadingPreview !== null && loadingPreview !== voice.id}
              aria-label={previewing === voice.id
                ? `Stop the ${voice.name} preview`
                : `Hear ${voice.name}`}
            >
              {#if loadingPreview === voice.id}
                <span class="spinner" aria-hidden="true"></span>
              {:else if previewing === voice.id}
                ■
              {:else}
                ▶
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

  <footer>
    <button class="confirm" onclick={confirm} disabled={!choice || choice === selected}>
      {scopeLabel ? `Use for ${scopeLabel}` : 'Use this voice'}
    </button>
  </footer>
</div>

<style>
  .audition {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .sample {
    margin: 0.25rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    opacity: 0.65;
  }

  .close {
    border: none;
    background: none;
    color: var(--text-color);
    font-size: 1rem;
    cursor: pointer;
    opacity: 0.6;
  }

  .group h4 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  ul {
    display: grid;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }

  .voice {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--surface-color);
    cursor: pointer;
  }

  .voice.chosen {
    border-color: var(--primary-color);
  }

  .voice input {
    margin: 0;
  }

  .name {
    font-weight: 600;
  }

  .gender {
    margin-left: auto;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .preview {
    flex-shrink: 0;
    width: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--surface-color);
    color: var(--text-color);
    font-size: 0.85rem;
    cursor: pointer;
  }

  .preview:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .preview.playing {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  .spinner {
    width: 0.85rem;
    height: 0.85rem;
    border: 2px solid var(--border-color);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  footer {
    position: sticky;
    bottom: 0;
    padding-top: 0.5rem;
    background: var(--bg-color);
  }

  .confirm {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--primary-color);
    color: var(--surface-color);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }

  .confirm:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
