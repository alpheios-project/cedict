import fs from 'fs'
import readline from 'readline'

// Not sure why calculated size is smaller than the actual one; this ratio is to adjust it to norm
const adjustmentRatio = 1.2
const targetChunkSize = 1e7
const chunkSizeLimit = Math.round(targetChunkSize / adjustmentRatio)
const encoder = new TextEncoder()
const stringifyOptions = [null, 2] // Encoder, number of spaces

const sourceInfo = {
  path: '../src/',
  fileName: 'cedict_ts',
  fileExtension: 'u8'
}

const targetInfo = {
  path: '../dest/',
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
  input: fs.createReadStream(`${sourceInfo.path}${sourceInfo.fileName}.${sourceInfo.fileExtension}`),
  output: process.stdout
})

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
  const entry = {
    index: counter,
    traditionalHeadword: parts[1],
    simplifiedHeadword: parts[2],
    pinyin: parts[3],
    definition: parts[4]
  }
  dictData.entries.push(entry)
  sizeData.push({
    index: counter,
    size: encoder.encode(JSON.stringify(entry, ...stringifyOptions)).length
  })
  counter++
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
    targetInfo.version = `v${match[1]}${match[2]}${match[3]}`
    dictData.metadata.version = targetInfo.version
  } else {
    console.error('Cannot parse a version field')
  }

  match = metadataStr.match(/#! time=(.+)/)
  if (match !== null) {
    dictData.metadata.dateTime = new Date(parseInt(match[1], 10) * 1000)
  } else {
    console.error('Cannot parse a time field')
  }

  const metadataSize = encoder.encode(JSON.stringify(dictData.metadata, ...stringifyOptions)).length
  let chunks = [] // eslint-disable-line prefer-const
  let size = metadataSize
  let currentChunkIndex = 0
  sizeData.forEach((entry) => {
    if ((size + entry.size) >= chunkSizeLimit) {
      // This is a split point
      if (currentChunkIndex === 0) {
        // This is the first chunk and it must include a metadata object
        chunks.push({
          metaData: dictData.metadata,
          entries: dictData.entries.slice(currentChunkIndex, entry.index - 1)
        })
      } else {
        chunks.push({
          entries: dictData.entries.slice(currentChunkIndex, entry.index - 1)
        })
      }
      currentChunkIndex = entry.index - 1
      size = 0
    }
    size += entry.size
  })
  // Add the last chunk
  chunks.push({
    entries: dictData.entries.slice(currentChunkIndex, dictData.entries.length)
  })

  chunks.forEach((chunk, index) => {
    const output = JSON.stringify(chunk, ...stringifyOptions)
    fs.writeFile(`${targetInfo.path}${targetInfo.fileName}-${targetInfo.version}-c${String(index + 1).padStart(3, '0')}.${targetInfo.fileExtension}`, output, function (err) {
      if (err) {
        return console.error(err)
      }
    })
  })
})
