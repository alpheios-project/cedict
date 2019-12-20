import { createRlInterface } from './utility.js'

const unihanSourceInfo = {
  path: './src/unihan/',
  fileName: 'Unihan_Readings',
  fileExtension: 'txt'
}

let currentUnihanCode
let currentUnihanEntry
let counter = 0
let metadataStr = ''
const unihanData = new Map()
// A list of lines that should be skipped during parsing
const skippableLines = [
  '',
  '#',
  '# EOF'
]
// A list of fields we're interested in. All other fields will be skipped
const parsableFields = {
  kCantonese: 'cantonese',
  kMandarin: 'mandarin',
  kTang: 'tang',
  kDefinition: 'definition'
}

/**
 * This function will be called once for each line from a source file.
 *
 * @param {string} line - A single line from a source file.
 */
const unihanLineParser = (line) => {
  counter++
  if (skippableLines.includes(line)) return

  if (/^#/.test(line)) {
    // Assemble metadata into a single string for further parsing
    metadataStr += `${line}\n`
    return
  }

  const parts = line.match(/^(\S*)\s(\S*)\s(.*)$/)
  if (!parts || parts.length !== 4) {
    console.error(`Cannot parse line ${counter} of unihan source file: ${line}`)
    return
  }

  const unihanCode = parts[1]
  if (unihanCode !== currentUnihanCode) {
    // This is a new entry
    // Store previous entry in the map
    if (currentUnihanEntry !== undefined) {
      unihanData.set(currentUnihanCode, Object.assign({}, currentUnihanEntry))
    }
    currentUnihanCode = unihanCode
    currentUnihanEntry = {}
  }
  if (Object.keys(parsableFields).includes(parts[2])) {
    currentUnihanEntry[parsableFields[parts[2]]] = parts[3]
  }
}

/**
 * A function that reads a Unihan source file and parses its data.
 *
 * @returns {Promise|Promise} A promise that will be resolved with the map containing Unihan data or
 *          rejected if case of an error.
 */
const getUnihanData = () => {
  return new Promise((resolve, reject) => {
    const unihanRlInterface = createRlInterface(unihanSourceInfo)
    unihanRlInterface.on('line', unihanLineParser)
    unihanRlInterface.on('close', () => {
      resolve(unihanData)
    })
  })
}

export { getUnihanData }
