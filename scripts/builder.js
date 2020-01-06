import fs from 'fs'
import { getCedictData } from './cedict.js'
import { getUnihanData } from './unihan.js'
import { getIrgData } from './irg.js'
import { getDictLikeData } from './dictionary-like-data.js'

// A revision number, will be used to identify changes if there is more than one revision per day
const revision = 1

// Not sure why calculated size is smaller than the actual one; this ratio is to adjust it to norm
const adjustmentRatio = 1.21
const targetChunkSize = 1e7
const chunkSizeLimit = Math.round(targetChunkSize / adjustmentRatio)
const encoder = new TextEncoder()
const stringifyOptions = [null, 2] // Encoder, number of spaces

const targetInfo = {
  path: './dist/',
  fileName: 'cedict',
  version: '',
  revision: '',
  fileExtension: 'json'
}

const frequencyMeta = [
  {
    value: 1,
    name: 'least frequent',
    order: 5
  },
  {
    value: 2,
    name: 'less frequent',
    order: 4
  },
  {
    value: 3,
    name: 'moderatelyfrequent',
    order: 3
  },
  {
    value: 4,
    name: 'more frequent',
    order: 2
  },
  {
    value: 5,
    name: 'most frequent',
    order: 1
  }
]

/*
Name and location of a test file
 */
const testTargetInfo = {
  path: './test/',
  fileName: 'zho-cedict',
  version: '',
  revision: '',
  fileExtension: 'json'
}

/*
A list of entry IDs that will be included into the test file
 */
const testRecords = [
  2,
  35909,
  55562,
  72267,
  73893,
  83686,
  108832,
  108835
]

/**
 * Returns a unicode character code point of an argument.
 *
 * @param {string} char - A string containing a single character.
 * @returns {string} A hex character code point in the format of "U+XXXX" where X is a hex digit.
 */
const getCodePoint = (char) => {
  const hex = '0123456789ABCDEF'
  const u = char.charCodeAt(0)
  return 'U+' +
    hex[(u >>> 12) & 15] +
    hex[(u >>> 8) & 15] +
    hex[(u >>> 4) & 15] +
    hex[u & 15]
}

const calculateEntrySizes = (dictData) => {
  return dictData.entries.map((entry, index) => ({
    index: index,
    size: encoder.encode(JSON.stringify(entry, ...stringifyOptions)).length
  }))
}

const calculateMeta = (cedictMeta) => {
  let meta = {} // eslint-disable-line prefer-const
  meta.version = Number.parseInt(cedictMeta.dateTime.toISOString().split('T')[0].replace(/-/g, ''), 10)
  meta.revision = revision
  meta.frequency = frequencyMeta
  return meta
}

const appendUnihanData = (cedictEntries, unihanData, irgData, dictLikeData) => {
  cedictEntries.forEach(entry => {
    // We will not add Unihan data to multi-character words for now
    if (entry.traditional && entry.traditional.headword && entry.traditional.headword.length === 1) {
      const codePoint = getCodePoint(entry.traditional.headword[0])
      if (unihanData.has(codePoint)) {
        // There is some Unihan info available
        const unihanObject = unihanData.get(codePoint)
        const { definition, ...dataObject } = unihanObject
        entry.traditional = Object.assign(entry.traditional, dataObject)
        entry.traditional.codePoint = codePoint
        if (entry.definitions.length === 0 && definition) {
          entry.definitions.push(definition)
        }
      }
      if (irgData.has(codePoint)) {
        entry.traditional.radical = irgData.get(codePoint)
        // We do not need to store simplified  field for traditional forms as we know it'll always be false
        delete entry.traditional.radical.simplified
      }
      if (dictLikeData.has(codePoint)) {
        entry.traditional.frequency = dictLikeData.get(codePoint).frequency
        entry.traditional.totalStrokes = dictLikeData.get(codePoint).totalStrokes
      }
    }
    if (entry.simplified && entry.simplified.headword && entry.simplified.headword.length === 1) {
      const code = getCodePoint(entry.simplified.headword[0])
      if (unihanData.has(code)) {
        // There is some Unihan info available
        const unihanObject = unihanData.get(code)
        const { definition, ...dataObject } = unihanObject
        entry.simplified = Object.assign(entry.simplified, dataObject)
        entry.simplified.codePoint = code
        if (entry.definitions.length === 0 && definition) {
          entry.definitions.push(definition)
        }
      }
      if (irgData.has(code)) entry.simplified.radical = irgData.get(code)
      if (dictLikeData.has(code)) {
        entry.simplified.frequency = dictLikeData.get(code).frequency
        entry.simplified.totalStrokes = dictLikeData.get(code).totalStrokes
      }
    }
  })
  return cedictEntries
}

const writeData = (dictData) => {
  const metadataSize = encoder.encode(JSON.stringify(dictData.metadata, ...stringifyOptions)).length
  const cedictMetaSize = encoder.encode(JSON.stringify(dictData.cedictMeta, ...stringifyOptions)).length
  const sizeData = calculateEntrySizes(dictData)
  let chunks = [] // eslint-disable-line prefer-const
  let size = metadataSize + cedictMetaSize
  let currentChunkIndex = 0
  sizeData.forEach((entry) => {
    if ((size + entry.size) >= chunkSizeLimit) {
      // This is a split point. Each chunk will have a metadata object at the top
      chunks.push({
        metadata: dictData.metadata,
        cedictMeta: dictData.cedictMeta,
        entries: dictData.entries.slice(currentChunkIndex, entry.index - 1)
      })
      currentChunkIndex = entry.index - 1
      // Reset size to its initial value
      size = metadataSize
    }
    size += entry.size
  })
  // Add the last chunk
  chunks.push({
    metadata: dictData.metadata,
    cedictMeta: dictData.cedictMeta,
    entries: dictData.entries.slice(currentChunkIndex, dictData.entries.length)
  })

  // Build a version of data for testing that will include only those entries that are used during tests
  const testData = {
    metadata: dictData.metadata,
    cedictMeta: dictData.cedictMeta,
    entries: dictData.entries.filter(entry => testRecords.includes(entry.index))
  }

  // Write test data to the test file
  const testOutput = JSON.stringify(testData, ...stringifyOptions)
  fs.writeFile(`${testTargetInfo.path}${testTargetInfo.fileName}.${testTargetInfo.fileExtension}`, testOutput, function (err) {
    if (err) {
      return console.error(err)
    }
  })

  // Split CEDICT dictionary data into chunks and write them to files
  chunks.forEach((chunk, index) => {
    chunk.metadata.chunkNumber = index + 1
    const output = JSON.stringify(chunk, ...stringifyOptions)
    let version = `v${dictData.metadata.version}`
    if (dictData.metadata.revision > 1) {
      // Revision number will be omitted from the file name if it is `1`
      version += `r${dictData.metadata.revision}`
    }
    fs.writeFile(`${targetInfo.path}${targetInfo.fileName}-${version}-c${String(index + 1).padStart(3, '0')}.${targetInfo.fileExtension}`, output, function (err) {
      if (err) {
        return console.error(err)
      }
    })
  })
}

Promise.all([getCedictData(), getUnihanData(), getIrgData(), getDictLikeData()])
  .then(([cedictData, unihanData, irgData, dictLikeData]) => {
    const distData = {
      cedictMeta: cedictData.metadata
    }
    distData.metadata = calculateMeta(cedictData.metadata)
    distData.entries = appendUnihanData(cedictData.entries, unihanData, irgData, dictLikeData)
    writeData(distData)
    console.log('CEDICT data files have been generated successfully.')
    console.log('Please copy a test data sample from cedict/test/zho-cedict.json to fixtures/src/localJson.')
  }).catch(error => {
    console.log(error)
  })
