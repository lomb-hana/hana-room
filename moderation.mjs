// Server-side text filter for racial, ethnic, and homophobic slurs,
// including common obfuscations. This module is imported only by the
// Node server, never by the client bundle.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const LIST_FILE = process.env.BLOCKLIST_FILE || path.join(ROOT, 'blocklist.txt')

const LEET = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
}

function loadTerms() {
  let text = ''
  try {
    text = fs.readFileSync(LIST_FILE, 'utf8')
  } catch {
    return { words: [], phrases: [] }
  }
  const words = []
  const phrases = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim().toLowerCase()
    if (!line) continue
    if (/\s/.test(line)) phrases.push(line.replace(/\s+/g, ' '))
    else words.push(line)
  }
  return { words, phrases }
}

function escapeRe(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "nigger" -> n+i+g{2,}e+r+ so a single "g" (as in the country Niger) does not match.
function patternFor(word) {
  let out = ''
  for (let i = 0; i < word.length; ) {
    const ch = word[i]
    let n = 1
    while (i + n < word.length && word[i + n] === ch) n++
    out += escapeRe(ch) + (n === 1 ? '+' : `{${n},}`)
    i += n
  }
  return new RegExp(`^${out}$`)
}

const { words, phrases } = loadTerms()
const wordPatterns = words.map(patternFor)
const phrasePatterns = phrases.map((p) => {
  const parts = p.split(' ')
  return parts.map(patternFor)
})
const compactPhrasePatterns = phrases.map((p) => patternFor(p.replace(/\s+/g, '')))

export function fold(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .toLowerCase()
}

function leet(s) {
  let out = ''
  for (const ch of s) out += LEET[ch] || ch
  return out
}

function letters(s) {
  return s.replace(/[^a-z]+/g, '')
}

function tokensOf(text) {
  const folded = leet(fold(text))
  return folded.split(/[^a-z0-9]+/).filter(Boolean).map((t) => t.replace(/[^a-z]+/g, '')).filter(Boolean)
}

function combos(tokens) {
  const extra = []
  const max = Math.min(tokens.length, 200)
  for (let i = 0; i < max; i++) {
    let s = tokens[i]
    for (let j = i + 1; j < max && j <= i + 24; j++) {
      s += tokens[j]
      extra.push(s)
    }
  }
  return extra
}

function wordHit(token) {
  if (!token) return false
  return wordPatterns.some((re) => re.test(token)) || compactPhrasePatterns.some((re) => re.test(token))
}

function phraseHit(tokens) {
  if (!phrasePatterns.length || tokens.length < 2) return false
  for (const parts of phrasePatterns) {
    const n = parts.length
    for (let i = 0; i + n <= tokens.length; i++) {
      let ok = true
      for (let k = 0; k < n; k++) {
        if (!parts[k].test(tokens[i + k])) {
          ok = false
          break
        }
      }
      if (ok) return true
    }
  }
  return false
}

export function containsBlocked(text) {
  const tokens = tokensOf(text)
  if (tokens.some(wordHit)) return true
  if (combos(tokens).some(wordHit)) return true
  if (phraseHit(tokens)) return true
  return false
}

export const BLOCKED_MESSAGE = "Hana doesn't do that word. Try again."

export const _test = { words, phrases, fold, leet, tokensOf, letters, wordPatterns }

function leetify(word) {
  const map = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7' }
  return [...word].map((ch) => map[ch] || ch).join('')
}

function spaced(word, sep) {
  return [...word].join(sep)
}

if (process.argv.includes('--test')) {
  const { words: w, phrases: p } = { words, phrases }
  let failed = 0
  const miss = []
  const falsePos = []

  function expectBlock(sample, label) {
    if (!containsBlocked(sample)) {
      failed++
      miss.push(label)
    }
  }
  function expectPass(sample, label) {
    if (containsBlocked(sample)) {
      failed++
      falsePos.push(label)
    }
  }

  for (const word of w) {
    const tag = `term:${word.length}`
    expectBlock(word, `${tag} exact`)
    expectBlock(word.toUpperCase(), `${tag} upper`)
    expectBlock(word[0].toUpperCase() + word.slice(1), `${tag} title`)
    expectBlock(leetify(word), `${tag} leet`)
    expectBlock(spaced(word, ' '), `${tag} spaced`)
    expectBlock(spaced(word, '.'), `${tag} dotted`)
    expectBlock(spaced(word, '-'), `${tag} dashed`)
    expectBlock(word[0] + word[0] + word.slice(1), `${tag} doubled-first`)
    expectBlock(`hey ${word} there`, `${tag} in sentence`)
  }
  for (const phrase of p) {
    const tag = `phrase:${phrase.length}`
    expectBlock(phrase, `${tag} exact`)
    expectBlock(phrase.toUpperCase(), `${tag} upper`)
    expectBlock(leetify(phrase), `${tag} leet`)
    expectBlock(phrase.replace(/ /g, '   '), `${tag} extra spaces`)
    expectBlock(phrase.replace(/ /g, ''), `${tag} compact`)
  }

  const innocent = [
    'Scunthorpe',
    'Niger',
    'Nigeria',
    'assistant',
    'class',
    'grape',
    'raccoon',
    'cocoon',
    'Pakistan',
    'Japan',
    'Japanese',
    'spicy',
    'snicker',
    'snigger',
    'niggardly',
    'holiday',
    'background',
    'cocktail',
    'classic',
    'hello from houston',
    'I love this room',
    'passage',
    'assign',
    'typical',
  ]
  for (const word of innocent) expectPass(word, word)

  if (failed) {
    console.error(`FAIL ${failed}`)
    if (miss.length) console.error('missed', miss.slice(0, 20).join(', '))
    if (falsePos.length) console.error('false positives', falsePos.join(', '))
    process.exit(1)
  }
  console.log(`ok ${w.length} terms, ${p.length} phrases, ${innocent.length} innocent`)
}
