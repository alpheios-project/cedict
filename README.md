# Chinese Data
Combines data from [CEDICT Chinese-English dictionary](http://cgibin.erols.com/mandarintools/cedict.html) and from [Unihan databse](https://www.unicode.org).

This repository contains data from CEDICT and Unihan database and the code that combines those data items into the files that will be used by [Lexis CS](https://github.com/alpheios-project/lexis-cs/) to serve Chinese lexical data.

The code in this repository is very technical by nature; its sole purpose is to generate output files correctly. This explains the directory structure that is different from other Alpheios projects. There is no code that we build into some other code here. There are just some scripts that generates dictionary data out of other dictionary data. This code is located within the `scripts` directory. 

The source data files are located within the `src` directory. There are source files from CEDICT and Unihan distributions. The final output is in a `dist` directory.

The conversion code is running in node.js. The entry point is `builder.js`, as specified in `package.json`. But it does not build code, it rather builds data (or transforms data from one form to the other if to look at it from a slightly different angle). We have to re-run a build process every time source data changes.

The conversion code is split it into several files. Each file contains a combination of functions that transform data from a specific source file, and the name of the file reflects that (i.e. `cedict.js` transforms files form a CEDICT data source). `builder.js` is an entry point that runs them all.

The conversion code have to be changed every time source data format changes. There is probably no way around it. However, the code as it is can handle the current source data formats without any issues. On reasonably powerful machines conversion process takes a second or two.

Output files in a `dist` directory are designed to be understandable enough, even for persons without IT background. It would allow to observe the content easily and find data errors if there are any. It is also important that data structures used to represent Chinese data would make sense in reflecting the nature of Chinese lexical data.

The output files are quite large. This is a conscious decision to sacrifice size for readability. It should not be a problem as those files will be gzipped by the server that will distribute them. But if if size ever become an issue we can always make a compressed version of them.
