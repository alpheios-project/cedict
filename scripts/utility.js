import fs from 'fs'
import readline from 'readline'

// An interface for reading from a source file
const createRlInterface = (sourceInfo) => {
  return readline.createInterface({
    input: fs.createReadStream(`${sourceInfo.path}${sourceInfo.fileName}.${sourceInfo.fileExtension}`)
  })
}

export { createRlInterface }
