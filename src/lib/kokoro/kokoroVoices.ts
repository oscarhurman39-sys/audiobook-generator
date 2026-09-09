// Lightweight voice metadata — no heavy dependencies
// Extracted from kokoroClient.ts so consumers that only need voice lists
// don't pull in kokoro-js (~2.9 MB)

export type VoiceId =
  | 'af_heart'
  | 'af_alloy'
  | 'af_aoede'
  | 'af_bella'
  | 'af_jessica'
  | 'af_kore'
  | 'af_nicole'
  | 'af_nova'
  | 'af_river'
  | 'af_sarah'
  | 'af_sky'
  | 'am_adam'
  | 'am_echo'
  | 'am_eric'
  | 'am_liam'
  | 'am_michael'
  | 'am_onyx'
  | 'am_puck'
  | 'am_santa'
  | 'bf_emma'
  | 'bf_isabella'
  | 'bm_george'
  | 'bm_lewis'
  | 'bf_alice'
  | 'bf_lily'
  | 'bm_daniel'
  | 'bm_fable'

const VOICES: VoiceId[] = [
  'af_heart',
  'af_alloy',
  'af_aoede',
  'af_bella',
  'af_jessica',
  'af_kore',
  'af_nicole',
  'af_nova',
  'af_river',
  'af_sarah',
  'af_sky',
  'am_adam',
  'am_echo',
  'am_eric',
  'am_liam',
  'am_michael',
  'am_onyx',
  'am_puck',
  'am_santa',
  'bf_emma',
  'bf_isabella',
  'bm_george',
  'bm_lewis',
  'bf_alice',
  'bf_lily',
  'bm_daniel',
  'bm_fable',
]

export function listVoices(): VoiceId[] {
  return VOICES
}

// ---------------------------------------------------------------------------
// Voice metadata
//
// The IDs encode accent and gender — af_ = American female, bm_ = British male
// and so on — but an ID is not something to put in front of a listener. This
// gives every voice a readable name and a group, so the picker can present
// "British · Female · Emma" rather than "bf_emma".
//
// Kokoro's own documentation notes that quality varies significantly by voice,
// so nothing here ranks them. Which one is best is a listening decision.
// ---------------------------------------------------------------------------

export type VoiceAccent = 'british' | 'american'
export type VoiceGender = 'female' | 'male'

export interface VoiceInfo {
  id: VoiceId
  /** Given name, capitalised from the ID. */
  name: string
  accent: VoiceAccent
  gender: VoiceGender
}

const ACCENT_BY_PREFIX: Record<string, VoiceAccent> = { a: 'american', b: 'british' }
const GENDER_BY_PREFIX: Record<string, VoiceGender> = { f: 'female', m: 'male' }

export const ACCENT_LABELS: Record<VoiceAccent, string> = {
  british: 'British English',
  american: 'American English',
}

export const GENDER_LABELS: Record<VoiceGender, string> = {
  female: 'Female',
  male: 'Male',
}

/** Parse the accent/gender/name encoded in a Kokoro voice ID. */
export function describeVoice(id: VoiceId): VoiceInfo {
  const [prefix, rawName = ''] = id.split('_')
  const accent = ACCENT_BY_PREFIX[prefix?.[0] ?? ''] ?? 'american'
  const gender = GENDER_BY_PREFIX[prefix?.[1] ?? ''] ?? 'female'
  const name = rawName ? rawName[0].toUpperCase() + rawName.slice(1) : id

  return { id, name, accent, gender }
}

export function listVoiceInfo(): VoiceInfo[] {
  return VOICES.map(describeVoice)
}

export interface VoiceGroup {
  accent: VoiceAccent
  label: string
  voices: VoiceInfo[]
}

/**
 * Voices grouped by accent, British first.
 *
 * British leads because the app defaults to English narration and the accent
 * split is the first thing a listener actually chooses between; within a group
 * voices are ordered female then male, then alphabetically, so the list is
 * stable rather than in model-file order.
 */
export function groupVoicesByAccent(): VoiceGroup[] {
  const all = listVoiceInfo()
  const accents: VoiceAccent[] = ['british', 'american']

  return accents.map((accent) => ({
    accent,
    label: ACCENT_LABELS[accent],
    voices: all
      .filter((v) => v.accent === accent)
      .sort((a, b) => {
        if (a.gender !== b.gender) return a.gender === 'female' ? -1 : 1
        return a.name.localeCompare(b.name)
      }),
  }))
}

/** Whether an arbitrary string is a Kokoro voice ID. */
export function isVoiceId(value: string | undefined): value is VoiceId {
  return !!value && (VOICES as string[]).includes(value)
}
