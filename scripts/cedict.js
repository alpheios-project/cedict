import { createRlInterface } from './utility.js'

const sourceInfo = {
  path: './src/cedict/',
  fileName: 'cedict_ts',
  fileExtension: 'u8'
}

let counter = 1
let metadataStr = ''

let dictData = { // eslint-disable-line prefer-const
  metadata: {},
  entries: []
}

/**
 * Some words can be homonyms. In that case they will have classifiers in their definition field
 * and some text after the end of it (i.e. the classifier).
 * We must split such definitions into multiple so we'll be able to create a separate entry for each meaning.
 *
 * @param {string} definition - A definition for an entry
 * @param {Array<object>} storage - An array of object where parsing results will be stored.
 */
const parseDescription = (definition, storage) => {
  let result = {} // eslint-disable-line prefer-const
  const clPos = definition.search(/\/CL:/)
  if (clPos !== -1) {
    // This definition has a classifier
    result.definitions = definition.substring(0, clPos)
    definition = definition.substring(clPos + 1)
    const nextDescrPos = definition.search(/\//)
    if (nextDescrPos !== -1) {
      // Start from the third position to remove `CL:`
      result.classifier = definition.substring(3, nextDescrPos)
      storage.push(result)
      definition = definition.substring(nextDescrPos + 1)
      parseDescription(definition, storage)
    } else {
      // There are no more parts to process
      // The rest of the definition string contains a classifier
      // Start from the third position to remove `CL:` at the beginning of it
      result.classifier = definition.substring(3)
      storage.push(result)
    }
  } else {
    result.definitions = definition
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
      classifier.traditional = { headword: hws[0] }
      classifier.simplilfied = { headword: (hws.length === 2) ? hws[1] : hws[0] }
      classifier.pinyin = clParts[2]
      classifiers.push(classifier)
    } else {
      console.error(`Cannot parse a "${str}" classifier`)
    }
  })
  return classifiers
}

/**
 * Parses CEDICT metadata.
 *
 * @param {string} metadataStr - A string containing CEDICT metadata.
 * @returns {object} A CEDICT metadata object.
 */
const parseCedictMeta = (metadataStr) => {
  let metaData = {} // eslint-disable-line prefer-const

  // Parse metadata
  let match = metadataStr.match(/^#\s(.+)/)
  if (match !== null) {
    metaData.name = match[1]
  } else {
    console.error('Cannot parse a dictionary name field')
  }

  match = metadataStr.match(/^.+\n# (.+)/)
  if (match !== null) {
    metaData.description = match[1]
  } else {
    console.error('Cannot parse a description field')
  }

  match = metadataStr.match(/# License:\n# (.+)/)
  if (match !== null) {
    metaData.licenseName = match[1]
  } else {
    console.error('Cannot parse a license name field')
  }

  match = metadataStr.match(/#! license=(.+)/)
  if (match !== null) {
    metaData.licenseURI = match[1]
  } else {
    console.error('Cannot parse a license URI field')
  }

  match = metadataStr.match(/# Referenced works:\n# (.+)/)
  if (match !== null) {
    metaData.referencedWorks = [match[1]]
  } else {
    console.error('Cannot parse a referenced works field')
  }

  match = metadataStr.match(/# CC-CEDICT can be downloaded from:\n# (.+)/)
  if (match !== null) {
    metaData.downloadURI = match[1]
  } else {
    console.error('Cannot parse a download URI field')
  }

  match = metadataStr.match(/# Additions and corrections can be sent through:\n# (.+)/)
  if (match !== null) {
    metaData.editorURI = match[1]
  } else {
    console.error('Cannot parse an editor URI field')
  }

  match = metadataStr.match(/# For more information about CC-CEDICT see:\n# (.+)/)
  if (match !== null) {
    metaData.referenceURI = match[1]
  } else {
    console.error('Cannot parse a reference URI field')
  }

  match = metadataStr.match(/#! version=(.+)/)
  if (match !== null) {
    metaData.originalVersion = match[1]
  } else {
    console.error('Cannot parse an original version number field')
  }

  match = metadataStr.match(/#! subversion=(.+)/)
  if (match !== null) {
    metaData.originalSubversion = match[1]
  } else {
    console.error('Cannot parse an original subversion number field')
  }

  match = metadataStr.match(/#! format=(.+)/)
  if (match !== null) {
    metaData.originalFormat = match[1]
  } else {
    console.error('Cannot parse an original format field')
  }

  match = metadataStr.match(/#! charset=(.+)/)
  if (match !== null) {
    metaData.originalCharset = match[1]
  } else {
    console.error('Cannot parse an original charset field')
  }

  match = metadataStr.match(/#! publisher=(.+)/)
  if (match !== null) {
    metaData.publisher = match[1]
  } else {
    console.error('Cannot parse a publisher field')
  }

  match = metadataStr.match(/#! time=(.+)/)
  if (match !== null) {
    metaData.dateTime = new Date(parseInt(match[1], 10) * 1000)
  } else {
    console.error('Cannot parse a time field')
  }
  return metaData
}

const cedictLineParser = (line) => {
  if (/^#/.test(line)) {
    // Assemble metadata into a single string for further parsing
    metadataStr += `${line}\n`
    return
  }

  const parts = line.match(/(\S+) (\S+) \[(.+)] \/(.+)\//)
  if (!parts || parts.length !== 5) {
    console.error(`Cannot parse line ${counter} of CEDICT source file: ${line}`)
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
      entryTemplate.traditional = {
        firstName: subparts[1],
        lastName: subparts[2]
      }
    } else {
      console.error(`Cannot parse a compound name in a traditional headword in line ${counter}: ${line}`)
    }

    subparts = parts[2].match(/(\S+)·(\S+)/)
    if (subparts) {
      entryTemplate.simplified = {
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
    entryTemplate.traditional = { headword: parts[1] }
    entryTemplate.simplified = { headword: parts[2] }
    entryTemplate.pinyin = parts[3]
  } else {
    // This is a regular dictionary entry
    entryTemplate.type = 'not specified'
    entryTemplate.traditional = { headword: parts[1] }
    entryTemplate.simplified = { headword: parts[2] }
    entryTemplate.pinyin = parts[3]
  }

  let parsedDefinitions = [] // eslint-disable-line prefer-const
  parseDescription(parts[4], parsedDefinitions)
  parsedDefinitions.forEach((definition) => {
    // If there are multiple definitions then this word is a homonym and shall produce multiple dictionary entries
    let entry = Object.assign({}, entryTemplate) // eslint-disable-line prefer-const
    entry.index = counter
    entry.definitions = definition.definitions.split('/')
    if (definition.hasOwnProperty('classifier')) { // eslint-disable-line no-prototype-builtins
      entry.classifier = parseClassifiers(definition.classifier)
    }
    dictData.entries.push(entry)
    counter++
  })
}

/**
 * A function that reads a CEDICT source file and parses its data.
 *
 * @returns {Promise|Promise} A promise that will be resolved with the map containing CEDICT data or
 *          rejected if case of an error.
 */
const getCedictData = () => {
  return new Promise((resolve, reject) => {
    const rlInterface = createRlInterface(sourceInfo)
    rlInterface.on('line', cedictLineParser)
    rlInterface.on('close', () => {
      dictData.metadata = parseCedictMeta(metadataStr)
      resolve(dictData)
    })
  })
}

export { getCedictData }
