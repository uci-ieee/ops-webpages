# OPS Webpages

## [Preview Site](https://uci-ieee.github.io/ops-webpages-2023-2024/)

## Developing Guide

### Requirements

- [Node](#node)
- [Git](#git)
- Text Editor (Recommended: [VSCode](https://code.visualstudio.com/))
- GitHub Account + Appropriate Repository Permissions

### First-Time Setup

- Install everything needed in the [Installation Instructions](#installation-instructions)
- Make sure you have appropriate permissions
- Clone this repository (Git is required)
- `cd` into the local repository

### Installation Instructions

#### Git

- See this: <https://git-scm.com/book/en/v2/Getting-Started-Installing-Git>

#### Node

- Get the latest LTS Node.js from the [Node.js website](https://nodejs.org/en/download) for your device (Windows, Mac, Linux, etc).

  - To check if you've successfully installed Node.js, try running `node -v` in your terminal. If a version pops up, you are ready to go.

    - Example:

      ```Powershell
      PS C:\Users\Dylan> node -v
      v16.13.0
      ```

- Double check if `npm` is installed using `npm -v`

  - It should automatically be installed with Node.js

    - Example:

      ```Powershell
      PS C:\Users\Dylan> npm -v
      9.6.0
      ```

#### SASS/SCSS

- Make sure Node.js is installed
- In the local repository, run `npm install` to install Bootstrap and SASS
- To reflect changes in the scss file(s), run `npm run sass` for a one-time compilation, or `npm run sass-watch` for automatic watching of changes

### Running SASS/SCSS

- Run `npm install` in your repository if you haven't already
- Run `npm run sass` for a one-time compilation of scss to css, or `npm run sass-watch` for automatic compilation when the scss files change
  - If you run `npm run sass-watch` and still want to access the command line, create a separate terminal after the command

### Development Process

- (Recommended) Create an issue/pick a specific issue
  - This helps organize the work done on this repository
- Create new branch on GitHub
- Fetch from origin
- Check out branch locally
- Run `npm install` to make sure all the packages are installed
- Develop feature/fix bugs
- Create Pull Request

### Workflows and SASS Compilation
The SCSS gets compiled in to CSS. Locally, this is done via the `npm run sass` and `npm run sass-watch`, but when the site is deployed onto the internet, this is done via a GitHub action.

The GitHub workflow file lives in the [ieee-website-2023-2024 repository's scss_compile_deploy.yml file](https://github.com/uci-ieee/ieee-website-2023-2024/blob/main/.github/workflows/scss_compile_deploy.yml). Specifically, the step being done is the `Compile SCSS` step.

When new SASS files are created, they need to be imported into `scss/custom.scss`. It should be imported similarly to the following by adding an `@import` followed by the path of the new scss file:

```scss
// add imports of all scss files
@import "./index.scss";
@import "./project/project_template.scss";
@import "./js/ops_header.scss";
@import "./js/ops_footer.scss";
```

### Cache Busting
Cache Busting is done by dynamically creating copies of the JS files in the `js` directory with a hash in the name. For example, `ops_header.js` will become `ops_header.137e471e540f8f5fd304a5f32d713fab.js`.

Here is the entire process, contained in `scripts/hash.js`:
1. Copies of the js files are made with the new hash name generated
2. Every HTML file that contains a reference to a .js file will be replaced with the hashed name. 

This is done in the GitHub workflows, using the `npm run cache-busting`. As such,  **do not run this command while developing locally** as it generates unnecessary and duplicate files. If it's run on accident, do not commit. Fix all the modifications to all the js files, or if it proves to be too much, restore.

Run `git status` to check all the untracked files. If the only untracked files are the hashed js files, then run `git clean -f` to delete all the hashed js file copies. This command deletes all the untracked files.

Run `git restore [html files]` where you add all the html files.

`git restore index.html lectures.html workshops.html syllabus.html` and so on...

If this is committed, then **all the JS will be broken**...
