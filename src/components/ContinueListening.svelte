<script lang="ts">
  /**
   * "Continue listening" — the resume-where-I-was card.
   *
   * Reading position is already saved per book; this surfaces the most recent
   * one so returning to the app is one tap rather than book → chapter → play.
   */
  import { onMount } from 'svelte'
  import { getMostRecentProgress, clearProgress } from '../stores/progressStore'
  import { libraryBooks } from '../stores/libraryStore'
  import { getBook, getChapterSegmentCount } from '../lib/libraryDB'
  import type { Chapter } from '../lib/types/book'
  import logger from '../lib/utils/logger'

  interface Props {
    oncontinue: (bookId: number, chapterId: string) => void
  }

  let { oncontinue }: Props = $props()

  interface Resume {
    bookId: number
    title: string
    author: string
    cover?: string
    chapter: Chapter
    chapterNumber: number
    chapterTotal: number
    /** 0–1 through the current chapter, or null when it can't be determined. */
    chapterFraction: number | null
  }

  let resume = $state<Resume | null>(null)
  let loading = $state(true)

  async function loadResume() {
    loading = true
    try {
      const progress = getMostRecentProgress()
      if (!progress) {
        resume = null
        return
      }

      const bookId = Number(progress.bookId)
      if (!Number.isFinite(bookId)) {
        resume = null
        return
      }

      const book = await getBook(bookId)
      if (!book) {
        // The book was deleted but its position outlived it.
        clearProgress(progress.bookId)
        resume = null
        return
      }

      const chapterIndex = book.chapters.findIndex((c) => c.id === progress.chapterId)
      if (chapterIndex === -1) {
        resume = null
        return
      }

      let chapterFraction: number | null = null
      try {
        const segmentCount = await getChapterSegmentCount(bookId, progress.chapterId)
        if (segmentCount > 0) {
          chapterFraction = Math.min(1, progress.segmentIndex / segmentCount)
        }
      } catch (err) {
        logger.debug('[ContinueListening] Could not size the chapter', err)
      }

      resume = {
        bookId,
        title: book.title,
        author: book.author,
        cover: book.cover,
        chapter: book.chapters[chapterIndex],
        chapterNumber: chapterIndex + 1,
        chapterTotal: book.chapters.length,
        chapterFraction,
      }
    } catch (err) {
      logger.warn('[ContinueListening] Failed to load resume state', err)
      resume = null
    } finally {
      loading = false
    }
  }

  onMount(loadResume)

  // Re-check when the library changes — a deleted book should drop the card.
  $effect(() => {
    void $libraryBooks
    void loadResume()
  })

  function handleContinue() {
    if (!resume) return
    oncontinue(resume.bookId, resume.chapter.id)
  }
</script>

{#if !loading && resume}
  <section class="continue" aria-labelledby="continue-heading">
    <h2 id="continue-heading">Continue listening</h2>

    <button class="card" onclick={handleContinue}>
      {#if resume.cover}
        <img class="cover" src={resume.cover} alt="" />
      {:else}
        <div class="cover placeholder" aria-hidden="true">
          {resume.title.slice(0, 1).toUpperCase()}
        </div>
      {/if}

      <div class="details">
        <div class="title">{resume.title}</div>
        {#if resume.author}
          <div class="author">{resume.author}</div>
        {/if}
        <div class="chapter">
          {resume.chapter.title || `Chapter ${resume.chapterNumber}`}
          <span class="of">· {resume.chapterNumber} of {resume.chapterTotal}</span>
        </div>

        {#if resume.chapterFraction !== null}
          <div
            class="bar"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(resume.chapterFraction * 100)}
            aria-label="Progress through this chapter"
          >
            <div class="fill" style="width: {Math.round(resume.chapterFraction * 100)}%"></div>
          </div>
        {/if}
      </div>

      <span class="play" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  </section>
{/if}

<style>
  .continue {
    margin-bottom: 1.5rem;
  }

  .continue h2 {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-color);
    opacity: 0.6;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 0.875rem;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--surface-color);
    color: var(--text-color);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease;
  }

  .card:hover {
    border-color: var(--primary-color);
  }

  .card:active {
    transform: scale(0.995);
  }

  .cover {
    flex-shrink: 0;
    width: 56px;
    height: 76px;
    object-fit: cover;
    border-radius: 0.375rem;
    background: var(--bg-color);
  }

  .cover.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 700;
    opacity: 0.5;
  }

  .details {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    font-size: 1rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author,
  .chapter {
    font-size: 0.8rem;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chapter {
    margin-top: 0.25rem;
  }

  .of {
    opacity: 0.7;
  }

  .bar {
    margin-top: 0.5rem;
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--primary-color);
  }

  .play {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--primary-color);
    color: var(--surface-color);
  }

  @media (max-width: 480px) {
    .cover {
      width: 48px;
      height: 66px;
    }
  }
</style>
