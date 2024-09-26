/** A webpage collapsible component
 * @example <script src="./js/collapsible.js" title="Click to Reveal Answer" content="290Ω"></script>
 */
function createCollapsible() {

    // title: what is seen at the top of the collapsible
    const title = document.currentScript.getAttribute('title');
    // content: what is seen inside the collapsible
    // could be HTML
    const content = document.currentScript.getAttribute('content');

    // a collapsible needs to point to a unique id for the bootstrap collapsible function. Dynamically generate an id based on the collapsible title and contents, hoping that it's unique across the page.
    // testing every collapsible is highly recommended when utilizing a collapsible component

    const collapsibleID = generateCollapsibleID();

    // check to see if the collapsible built will have a unique ID
    const isUniqueID = checkIfUniqueID(collapsibleID);

    if (!isUniqueID) {
        // note: if an collapsible ID is not unique, then when one collapsible is toggled, all collapsibles with the same ID are also toggled, I believe 
        // notify in the console of an error
        console.error(`Collapsible with title: "${title}" and contents: "${content}" is the same across another collapsible in this page. Modify the title or contents to make the ID "${collapsibleID}" unique.`);
    }

    const accordionItemID = `${collapsibleID}1`


    // utilize the bootstrap accordion component as an easy to implement collapsible
    document.write(`
    <div class="accordion mb-3 mt-3" id="${collapsibleID}">
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse"
                    data-bs-target="#${accordionItemID}" aria-expanded="true" aria-controls="${accordionItemID}">
                    ${title}
                </button>
            </h2>
            <div id="${accordionItemID}" class="accordion-collapse collapse" data-bs-parent="#${collapsibleID}">
                <div class="accordion-body">
                    ${content}
                </div>
            </div>
        </div>
    </div>
    `);
}

/**
 * 
 * generate a valid string that can be used as a collapsible id
 * @returns {string}
 */
function generateCollapsibleID() {
    /* a valid HTML ID:
        1. must start with a letter
        2. can have letters (a-z, A-Z), digits (0-9), hyphens (-), and underscores (_)
        3. **must be unique in the HTML document**
    */

    // generate a collapsible ID using a UUID
    // collision chance: 0.00000006
    // see: https://dev.to/logrocket/understanding-uuids-in-nodejs-4bfe#:~:text=UUID%20length%20and%20collisions,-Because%20the%20UUID&text=Each%20UUID%20is%20distinct%20from,one%20billion%20UUIDs%20per%20second.
    let uuid = crypto.randomUUID();
    // if the UUID starts with a number, add an underscore at the beginning to make it a valid collapsible id
    if (/^\d/.test(uuid)) {
        uuid = '_' + uuid;
    }
    return uuid;
}

/**
 * queries the document for an element with the stated id, returning true if it's unique and
 * @param {string} id 
 * @returns {boolean}
 */
function checkIfUniqueID(id) {
    return document.getElementById(id) ? false : true;
}

// run the collapsible code
createCollapsible();