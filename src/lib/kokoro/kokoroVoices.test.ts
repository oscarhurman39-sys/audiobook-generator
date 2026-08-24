import { describe, it, expect } from 'vitest'
import {
  listVoices,
  listVoiceInfo,
  describeVoice,
  groupVoicesByAccent,
  isVoiceId,
  ACCENT_LABELS,
} from './kokoroVoices'

describe('kokoroVoices metadata', () => {
  describe('describeVoice', () => {
    it.each([
      ['bf_emma', { name: 'Emma', accent: 'british', gender: 'female' }],
      ['bm_george', { name: 'George', accent: 'british', gender: 'male' }],
      ['af_heart', { name: 'Heart', accent: 'american', gender: 'female' }],
      ['am_michael', { name: 'Michael', accent: 'american', gender: 'male' }],
    ] as const)('reads accent, gender and name from %s', (id, expected) => {
      expect(describeVoice(id)).toMatchObject(expected)
    })

    it('describes every shipped voice', () => {
      const described = listVoiceInfo()

      expect(described).toHaveLength(listVoices().length)
      for (const voice of described) {
        expect(voice.name).not.toBe('')
        expect(voice.name).toBe(voice.name[0].toUpperCase() + voice.name.slice(1))
        expect(['british', 'american']).toContain(voice.accent)
        expect(['female', 'male']).toContain(voice.gender)
      }
    })
  })

  describe('groupVoicesByAccent', () => {
    it('leads with British, since the app defaults to English narration', () => {
      const groups = groupVoicesByAccent()

      expect(groups.map((g) => g.accent)).toEqual(['british', 'american'])
      expect(groups[0].label).toBe(ACCENT_LABELS.british)
    })

    it('covers every voice exactly once', () => {
      const grouped = groupVoicesByAccent().flatMap((g) => g.voices.map((v) => v.id))

      expect(grouped.slice().sort()).toEqual(listVoices().slice().sort())
      expect(new Set(grouped).size).toBe(grouped.length)
    })

    it('includes the documented British voices', () => {
      const british = groupVoicesByAccent()[0].voices.map((v) => v.id)

      for (const voice of [
        'bf_emma',
        'bf_isabella',
        'bf_alice',
        'bf_lily',
        'bm_george',
        'bm_fable',
        'bm_daniel',
        'bm_lewis',
      ]) {
        expect(british).toContain(voice)
      }
    })

    it('orders each group female then male, alphabetically within', () => {
      for (const group of groupVoicesByAccent()) {
        const genders = group.voices.map((v) => v.gender)
        const firstMale = genders.indexOf('male')
        if (firstMale !== -1) {
          expect(genders.slice(firstMale).every((g) => g === 'male')).toBe(true)
        }

        const females = group.voices.filter((v) => v.gender === 'female').map((v) => v.name)
        expect(females).toEqual(females.slice().sort((a, b) => a.localeCompare(b)))
      }
    })
  })

  describe('isVoiceId', () => {
    it('accepts a real voice', () => {
      expect(isVoiceId('bf_emma')).toBe(true)
    })

    it.each([undefined, '', 'bf_nobody', 'en_GB-alan-medium'])('rejects %s', (value) => {
      expect(isVoiceId(value)).toBe(false)
    })
  })
})
