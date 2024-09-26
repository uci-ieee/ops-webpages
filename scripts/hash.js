const hashHelpers = require("./hashHelpers");

// this file hashes our js files to implement a form of cache busting

// obtain all the html files in the directory
const directoryPath = __dirname + "/../"; // Use the current directory
// here is where all the javascript files live
const jsPath = directoryPath + "/js/";

// here is where all the css files live
const cssPath = directoryPath + "/css/";

// generate a hash map of js files and create copies of the JS file with the hash in the name
const jsHashMap = hashHelpers.createHashMapOfFiles(jsPath, "js");
console.log(jsHashMap);
const cssHashMap = hashHelpers.createHashMapOfFiles(cssPath, "css")
console.log(cssHashMap);

// get a list of all the HTML files in the directory
const htmlFiles = hashHelpers.getHtmlFilePaths(directoryPath);
console.log(htmlFiles)

// iterate through all the html files and update the javascript
hashHelpers.updateHTMLFiles(htmlFiles, jsHashMap);

// update the css
hashHelpers.updateHTMLFiles(htmlFiles, cssHashMap);
