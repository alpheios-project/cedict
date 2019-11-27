import fs from 'fs'
import readline from 'readline'

// A revision number, will be used to identify changes if there is more than one revision per day
const revision = 1

// Not sure why calculated size is smaller than the actual one; this ratio is to adjust it to norm
const adjustmentRatio = 1.21
const targetChunkSize = 1e7
const chunkSizeLimit = Math.round(targetChunkSize / adjustmentRatio)
const encoder = new TextEncoder()
const stringifyOptions = [null, 2] // Encoder, number of spaces

const sourceInfo = {
  path: './src/',
  fileName: 'cedict_ts',
  fileExtension: 'u8'
}

const targetInfo = {
  path: './dist/',
  fileName: 'cedict',
  version: '',
  fileExtension: 'json'
}

let counter = 1
let metadataStr = ''
let dictData = { // eslint-disable-line prefer-const
  metadata: {},
  entries: []
}
let sizeData = [] // eslint-disable-line prefer-const

// An interface for reading from a source file
const rlInterface = readline.createInterface({
  input: fs.createReadStream(`${sourceInfo.path}${sourceInfo.fileName}.${sourceInfo.fileExtension}`)
})

/**
 * Some words can be homonyms. In that case they will have classifiers in their description field
 * and some text after the end of it (i.e. the classifier).
 * We must split such descriptions into multiple so we'll be able to create a separate entry for each meaning.
 *
 * @param {string} description - A description for an entry
 * @param {Array<object>} storage - An array of object where parsing results will be stored.
 */
const parseDescription = (description, storage) => {
  let result = {} // eslint-disable-line prefer-const
  const clPos = description.search(/\/CL:/)
  if (clPos !== -1) {
    // This description has a classifier
    result.descriptions = description.substring(0, clPos)
    description = description.substring(clPos + 1)
    const nextDescrPos = description.search(/\//)
    if (nextDescrPos !== -1) {
      // Start from the third position to remove `CL:`
      result.classifier = description.substring(3, nextDescrPos)
      storage.push(result)
      description = description.substring(nextDescrPos + 1)
      parseDescription(description, storage)
    } else {
      // There are no more parts to process
      // The rest of the description string contains a classifier
      // Start from the third position to remove `CL:` at the beginning of it
      result.classifier = description.substring(3)
      storage.push(result)
    }
  } else {
    result.descriptions = description
    storage.push(result)
  }
}

/**
 * Parses a classifier string (which might have multiple classifiers)
 * into an array of single classifier items.
 *
 * @param {string} classifiersString - One or several classifiers in a string
 * @returns {Array<object>} - An array of classifier objects
 */
const parseClassifiers = (classifiersString) => {
  const partStrings = classifiersString.split(',')
  let classifiers = [] // eslint-disable-line prefer-const
  partStrings.forEach((str) => {
    const clParts = str.match(/(.+)\[(.+)]/)
    if (clParts) {
      let classifier = {} // eslint-disable-line prefer-const
      const hws = clParts[1].split('|')
      classifier.traditionalHeadword = hws[0]
      classifier.simplilfiedHeadword = (hws.length === 2) ? hws[1] : hws[0]
      classifier.pinyin = clParts[2]
      classifiers.push(classifier)
    } else {
      console.error(`Cannot parse a "${str}" classifier`)
    }
  })
  return classifiers
}

rlInterface.on('line', (line) => {
  if (/^#/.test(line)) {
    // Assemble metadata into a single string for further parsing
    metadataStr += `${line}\n`
    return
  }

  const parts = line.match(/(\S+) (\S+) \[(.+)] \/(.+)\//)
  if (!parts || parts.length !== 5) {
    console.error(`Cannot parse line ${counter}: ${line}`)
    return
  }

  let entryTemplate = { // eslint-disable-line prefer-const
    // Index will be set later because one entry can be split into multiple
    index: 0
  }

  if (/·/.test(parts[1])) {
    // This is a compound name (e.g. a western name consisting of first and last names)
    entryTemplate.type = 'compound name'

    let subparts = parts[1].match(/(\S+)·(\S+)/)
    if (subparts) {
      entryTemplate.traditionalHeadword = ''
      entryTemplate.traditionalHeadwordParts = {
        firstName: subparts[1],
        lastName: subparts[2]
      }
    } else {
      console.error(`Cannot parse a compound name in a traditional headword in line ${counter}: ${line}`)
    }

    subparts = parts[2].match(/(\S+)·(\S+)/)
    if (subparts) {
      entryTemplate.simplifiedHeadword = ''
      entryTemplate.simplifiedHeadwordParts = {
        firstName: subparts[1],
        lastName: subparts[2]
      }
    } else {
      console.error(`Cannot parse a compound name in a traditional headword in line ${counter}: ${line}`)
    }

    subparts = parts[3].match(/(.+)\s·\s(.+)/)
    if (subparts) {
      entryTemplate.pinyin = ''
      entryTemplate.pinyinParts = {
        firstName: subparts[1],
        lastName: subparts[2]
      }
    } else {
      console.error(`Cannot parse a compound name in a traditional headword in line ${counter}: ${line}`)
    }
  } else if (/.+，.+/.test(parts[1])) {
    // This is a proverb
    entryTemplate.type = 'proverb'
    entryTemplate.traditionalHeadword = parts[1]
    entryTemplate.simplifiedHeadword = parts[2]
    entryTemplate.pinyin = parts[3]
  } else {
    // This is a regular dictionary entry
    entryTemplate.type = 'not specified'
    entryTemplate.traditionalHeadword = parts[1]
    entryTemplate.simplifiedHeadword = parts[2]
    entryTemplate.pinyin = parts[3]
  }

  let parsedDescriptions = [] // eslint-disable-line prefer-const
  parseDescription(parts[4], parsedDescriptions)
  parsedDescriptions.forEach((desc) => {
    // If there are multiple descriptions then this word is a homonym and shall produce multiple dictionary entries
    let entry = Object.assign({}, entryTemplate) // eslint-disable-line prefer-const
    entry.index = counter
    entry.descriptions = desc.descriptions.split('/')
    if (desc.hasOwnProperty('classifier')) { // eslint-disable-line no-prototype-builtins
      entry.classifier = parseClassifiers(desc.classifier)
    }
    dictData.entries.push(entry)
    sizeData.push({
      index: counter,
      size: encoder.encode(JSON.stringify(entry, ...stringifyOptions)).length
    })
    counter++
  })
})

rlInterface.on('close', () => {
  // Parse metadata
  let match = metadataStr.match(/^#\s(.+)/)
  if (match !== null) {
    dictData.metadata.name = match[1]
  } else {
    console.error('Cannot parse a dictionary name field')
  }

  match = metadataStr.match(/^.+\n# (.+)/)
  if (match !== null) {
    dictData.metadata.description = match[1]
  } else {
    console.error('Cannot parse a description field')
  }

  match = metadataStr.match(/# License:\n# (.+)/)
  if (match !== null) {
    dictData.metadata.licenseName = match[1]
  } else {
    console.error('Cannot parse a license name field')
  }

  match = metadataStr.match(/#! license=(.+)/)
  if (match !== null) {
    dictData.metadata.licenseURI = match[1]
  } else {
    console.error('Cannot parse a license URI field')
  }

  match = metadataStr.match(/# Referenced works:\n# (.+)/)
  if (match !== null) {
    dictData.metadata.referencedWorks = [match[1]]
  } else {
    console.error('Cannot parse a referenced works field')
  }

  match = metadataStr.match(/# CC-CEDICT can be downloaded from:\n# (.+)/)
  if (match !== null) {
    dictData.metadata.downloadURI = match[1]
  } else {
    console.error('Cannot parse a download URI field')
  }

  match = metadataStr.match(/# Additions and corrections can be sent through:\n# (.+)/)
  if (match !== null) {
    dictData.metadata.editorURI = match[1]
  } else {
    console.error('Cannot parse an editor URI field')
  }

  match = metadataStr.match(/# For more information about CC-CEDICT see:\n# (.+)/)
  if (match !== null) {
    dictData.metadata.referenceURI = match[1]
  } else {
    console.error('Cannot parse a reference URI field')
  }

  match = metadataStr.match(/#! version=(.+)/)
  if (match !== null) {
    dictData.metadata.originalVersion = match[1]
  } else {
    console.error('Cannot parse an original version number field')
  }

  match = metadataStr.match(/#! subversion=(.+)/)
  if (match !== null) {
    dictData.metadata.originalSubversion = match[1]
  } else {
    console.error('Cannot parse an original subversion number field')
  }

  match = metadataStr.match(/#! format=(.+)/)
  if (match !== null) {
    dictData.metadata.originalFormat = match[1]
  } else {
    console.error('Cannot parse an original format field')
  }

  match = metadataStr.match(/#! charset=(.+)/)
  if (match !== null) {
    dictData.metadata.originalCharset = match[1]
  } else {
    console.error('Cannot parse an original charset field')
  }

  match = metadataStr.match(/#! publisher=(.+)/)
  if (match !== null) {
    dictData.metadata.publisher = match[1]
  } else {
    console.error('Cannot parse a publisher field')
  }

  match = metadataStr.match(/#! date=(\d{4})-(\d{2})-(\d{2})/)
  if (match !== null) {
    targetInfo.version = `${match[1]}${match[2]}${match[3]}`
    dictData.metadata.version = targetInfo.version
  } else {
    console.error('Cannot parse a version field')
  }

  targetInfo.revision = revision
  dictData.metadata.revision = targetInfo.revision

  match = metadataStr.match(/#! time=(.+)/)
  if (match !== null) {
    dictData.metadata.dateTime = new Date(parseInt(match[1], 10) * 1000)
  } else {
    console.error('Cannot parse a time field')
  }
  // It will be set later but we need to have it here for calculation of the metadata size
  dictData.metadata.chunkNumber = 0

  const metadataSize = encoder.encode(JSON.stringify(dictData.metadata, ...stringifyOptions)).length
  let chunks = [] // eslint-disable-line prefer-const
  let size = metadataSize
  let currentChunkIndex = 0
  sizeData.forEach((entry) => {
    if ((size + entry.size) >= chunkSizeLimit) {
      // This is a split point. Each chunk will have a metadata object at the top
      chunks.push({
        metadata: dictData.metadata,
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
    entries: dictData.entries.slice(currentChunkIndex, dictData.entries.length)
  })

  chunks.forEach((chunk, index) => {
    chunk.metadata.chunkNumber = index + 1
    const output = JSON.stringify(chunk, ...stringifyOptions)
    let version = `v${targetInfo.version}`
    if (targetInfo.revision > 1) {
      // Revision number will be omitted from the file name if it is `1`
      version += `r${targetInfo.revision}`
    }
    fs.writeFile(`${targetInfo.path}${targetInfo.fileName}-${version}-c${String(index + 1).padStart(3, '0')}.${targetInfo.fileExtension}`, output, function (err) {
      if (err) {
        return console.error(err)
      }
    })
  })
})
