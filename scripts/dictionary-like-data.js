import { createRlInterface } from './utility.js'

const dictSourceInfo = {
  path: './src/unihan/',
  fileName: 'Unihan_DictionaryLikeData',
  fileExtension: 'txt'
}

let currentCode
let currentEntry
let counter = 0
let metadataStr = ''
const dictData = new Map()
// A list of lines that should be skipped during parsing
const skippableLines = [
  '',
  '#',
  '# EOF'
]
const frequencyFieldName = 'kFrequency'
const totalStrokesFieldName = 'kTotalStrokes'

/**
 * This function will be called once for each line from a source file.
 *
 * @param {string} line - A single line from a source file.
 */
const dictLineParser = (line) => {
  counter++
  if (skippableLines.includes(line)) return

  if (/^#/.test(line)) {
    // Assemble metadata into a single string for further parsing
    metadataStr += `${line}\n`
    return
  }

  const parts = line.match(/^(\S*)\s(\S*)\s(.*)$/)
  if (!parts || parts.length !== 4) {
    console.error(`Cannot parse line ${counter} of a dictionary like data source file: ${line}`)
    return
  }

  const code = parts[1]
  if (code !== currentCode) {
    // This is a new entry
    // Store a previous entry in the map
    if (currentEntry !== undefined) {
      dictData.set(currentCode, Object.assign({}, currentEntry))
    }
    currentCode = code
    currentEntry = {}
  }
  if (parts[2] === frequencyFieldName) {
    currentEntry.frequency = Number.parseInt(parts[3], 10)
  }
  if (parts[2] === totalStrokesFieldName) {
    currentEntry.totalStrokes = Number.parseInt(parts[3], 10)
  }
}

/**
 * A function that reads a source file and parses its data.
 *
 * @returns {Promise|Promise} A promise that will be resolved with the map containing data or
 *          rejected if case of an error.
 */
const getDictLikeData = () => {
  return new Promise((resolve, reject) => {
    const rlInterface = createRlInterface(dictSourceInfo)
    rlInterface.on('line', dictLineParser)
    rlInterface.on('close', () => {
      resolve(dictData)
    })
  })
}

export { getDictLikeData }
