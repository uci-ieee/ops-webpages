const fs = require("fs");
const crypto = require("crypto");
const path = require('path');

// this function defines helper functions used in hash.js to implement cache busting of cached files


/**
 * given a file path, generate an md5 hash from the content
 * @param {*} filePath 
 * @returns 
 */
function createHashOfFile(filePath) {
    console.log(filePath)
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(fileContent).digest('hex');
}

/**
 * generate a hash of all the files in the specified directory, also creating a copy of the file with the hashed name
 * @param {*} directoryPath where all the files that should be hashed live
 * @param {*} fileExtension the extension of the files. For example, "js", "css", etc. **omit the dot**.
 * @returns javascript object keyed by the original file name and the new hashed file name
 */
function createHashMapOfFiles(directoryPath, fileExtension) {
    // recursively iterate through every file in this directory to hash

    let filesMap = {};

    // for each file in the directory

    // read directory
    const files = fs.readdirSync(directoryPath);

    // make sure the fileExtension does not start with a dot. If so, remove it.
    if (fileExtension.at(0) === ".") {
        fileExtension = fileExtension.slice(1);
    }

    for (const file of files) {
        // hotfix issue: the css generated from the highlight.js gets hashed, and that causes a directory issue
        if (file === "highlight.js" || file === "highlight.min.js") {
            continue;
        }
        const filePath = path.join(directoryPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            // if the current file is a directory
            // recursively call the function for that directory and add it to the current running array of html files
            filesMap = { ...filesMap, ...createHashMapOfFiles(filePath, fileExtension) };
        } else {
            // If it is a file, check if it is an HTML file
            if (path.extname(file).toLowerCase() === `.${fileExtension}`) {
                // grab the file base
                const fileName = file.split(".").slice(0, -1).join(".");
                const hash = createHashOfFile(filePath);
                const newFileName = `${fileName}.${hash}.${fileExtension}`;

                // add it to the map
                filesMap[file] = newFileName;

                // copy the content of the original file to the new file with the name
                const newFilePath = path.join(directoryPath, newFileName);
                fs.copyFileSync(filePath, newFilePath);
            }
        }
    }

    // return the map
    return filesMap;
}


/**
 * update the html content to include the hashed file names
 * @param {*} htmlFiles a list of html file paths to update
 * @param {*} fileHashMap the map of the unhashed file names to the hashed name
 */
function updateHTMLFiles(htmlFiles, fileHashMap) {
    for (file of htmlFiles) {
        // read the file contents
        let htmlContent = fs.readFileSync(file, 'utf-8');
        // update all the files
        // NOTE: this is a bit circular
        for (const [fileName, hashedFileName] of Object.entries(fileHashMap)) {
            console.log(`searching for ${fileName} in ${file}`)
            updatedHtml = htmlContent.replaceAll(fileName, hashedFileName);
            if (updatedHtml !== htmlContent) {
                console.log(`${fileName} was found and replaced with ${hashedFileName}`);
                htmlContent = updatedHtml;
            } else {
                console.log(`${fileName} was not found in ${file}`)
            }
        }
        fs.writeFileSync(file, htmlContent, 'utf-8');
    }
}

/**
 * search for all the html files in the directory and return them as an array
 * @param {*} directoryPath 
 * @returns 
 */
function getHtmlFilePaths(directoryPath) {

    // list of files to ignore
    const filesToIgnore = [".git", ".vscode", ".node_modules"];

    // read directory
    const files = fs.readdirSync(directoryPath);

    // initialize an array for html file paths
    let htmlFiles = [];

    // for each file in the directory
    for (const file of files) {
        const filePath = path.join(directoryPath, file);

        if (filesToIgnore.some(fileToIgnore => filePath.includes(fileToIgnore))) {
            // ignore this file/directory
            // do nothing
        } else if (fs.statSync(filePath).isDirectory()) {
            // if the current file is a directory
            // recursively call the function for that directory and add it to the current running array of html files
            htmlFiles = htmlFiles.concat(getHtmlFilePaths(filePath));
        } else {
            // If it is a file, check if it is an HTML file
            if (path.extname(file).toLowerCase() === '.html') {
                htmlFiles.push(filePath);
            }
        }
    }
    return htmlFiles;
}

module.exports = { getHtmlFilePaths, createHashMapOfFiles, updateHTMLFiles };