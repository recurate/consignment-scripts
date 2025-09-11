// ==UserScript==
// @name         Print Label button
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Adds a button to extract page data into a printable popup with a QR code.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/print-label.user.js
// @downloadURL  https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/print-label.user.js
// ==/UserScript==


// 1) Fire a custom "tm-url-change" event whenever React changes the URL
(function(history) {
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  function fire() { window.dispatchEvent(new Event('tm-url-change')); }

  history.pushState = function() {
    const ret = origPush.apply(this, arguments);
    fire();
    return ret;
  };
  history.replaceState = function() {
    const ret = origReplace.apply(this, arguments);
    fire();
    return ret;
  };

  window.addEventListener('popstate', fire);   // back/forward
  window.addEventListener('hashchange', fire); // hash-based routers
})(window.history);

// 2) Route guard — only run on certain paths
function isListingPage() {
  // tweak this condition to your exact route needs
  return window.location.pathname.includes('/listings/');
}


// 3) Setup and teardown so features only exist on target pages
let teardownFns = []; // keep references to remove listeners, observers, DOM, etc.

function setupForListing() {
  // Avoid double-setup
  if (document.documentElement.dataset.tmListingSetup === '1') return;
  document.documentElement.dataset.tmListingSetup = '1';

  // …create your modal, attach button listeners, observers, etc.



    // --- 1. Create the Button Element ---
    const extractButton = document.createElement('button');
    extractButton.id = "print-label-btn";
    extractButton.textContent = 'Print label';

    // --- 2. Style the Button ---
    // We use CSS to position it in the lower-right corner and make it look nice.
    // 'position: fixed' keeps it on the screen even when you scroll.
    // 'zIndex' ensures it appears on top of most other page elements.
    Object.assign(extractButton.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '9999',
        color: '#FFFFFF',
        padding: '10px 20px',
        backgroundColor: '#000000',
        borderRadius: '20px',
        cursor: 'pointer',
        fontSize: '16px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
    });

    // --- 3. Define the Button's Action ---
    // This function will be called when the button is clicked.
    function openDataPopup() {
        // --- A. Find and extract the required values from the main page ---

        // 1. Get the ID from the second line of the specified class.
        const idElement = document.querySelector('.MuiTypography-root.MuiTypography-body2');
        let idValue = 'Not Found';
        if (idElement && idElement.innerHTML.includes('<br>')) {
            // Split the inner HTML by the <br> tag and take the second part.
            idValue = idElement.innerHTML.split('<br>')[1].trim();
        } else if (idElement) {
            // Fallback in case there is no <br> tag.
            idValue = idElement.textContent.trim();
        }

        // 1a. Clean the ID value by removing the "ID: " prefix.
        let cleanedId = 'Not Found';
        if (idValue !== 'Not Found') {
            cleanedId = idValue.replace('ID:', '').trim();
        }

        // 1b. Generate a QR code from the cleaned ID using a public API.
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(cleanedId)}`;


        // 2. Get the Product Name from the input with name="listing_title".
        const productNameElement = document.querySelector('input[name="listing_title"]');
        const productName = productNameElement ? productNameElement.value : 'Not Found';

        // 3. Get Option 1 from the input with name="option_value_0".
        const option1Element = document.querySelector('input[name="option_value_0"]');
        const option1 = option1Element ? option1Element.value : 'Not Found';

        // 4. Get Option 2 from the input with name="option_value_1".
        const option2Element = document.querySelector('input[name="option_value_1"]');
        const option2 = option2Element ? option2Element.value : 'Not Found';

        // 5. Get the Consignor from the element with data-testid="seller_email".
        const consignorElement = document.querySelector('[data-testid="seller_email"]');
        const consignor = consignorElement ? consignorElement.textContent.trim() : 'Not Found';


        // --- B. Create and display the popup with the extracted data ---

        // Opens a new, small browser window (a popup).
        const popup = window.open('', 'dataPopup', 'width=192,height=384,scrollbars=yes,resizable=yes');

        // Check if the popup was successfully created (i.e., not blocked by a popup blocker)
        if (popup) {
            // Construct the HTML content for the popup window.
            const popupContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Trove License Plate</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 5px; line-height: 1.6; }
                        h1 { font-size: 0.5em; margin-bottom: 5px; border-bottom: 1px solid #ccc; padding-bottom: 0px; }
                        p { margin: 8px 0; font-size: 0.5em; }
                        strong { color: #333; min-width: 90px; display: inline-block; }
                        .qr-container { text-align: center; margin-bottom: 15px; }
                        .qr-container img { border: 1px solid #ddd; padding: 4px; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <h1>Trove License Plate</h1>
                    <div class="qr-container">
                        <img src="${qrCodeUrl}" alt="QR Code for ID ${cleanedId}" title="QR Code for ID ${cleanedId}">
                    </div>
                    <p>${cleanedId}</p>
                    <p>${productName}</p>
                    <p>${option1}</p>
                    <p>${option2}</p>
                </body>
                </html>
            `;

            // Write the HTML content directly into the new popup window.
            popup.document.write(popupContent);
            popup.document.close(); // Finishes writing to the document.

            // --- C. Trigger the Print Dialog ---
            // We need to give the browser a moment to render the image before printing.
            popup.onload = function() {
                popup.print();
            };
        } else {
            // In case the user has a popup blocker enabled.
            console.log('Popup was blocked. Please allow popups for this site.');
        }
    }

    // --- 4. Attach the Action to the Button ---
    // We add an event listener that calls our function on a 'click' event.
    extractButton.addEventListener('click', openDataPopup);

    // --- 5. Add the Button to the Page ---
    // Finally, we append our newly created button to the body of the webpage.
    document.body.appendChild(extractButton);




  // Example: attach your click interceptor only on listing pages:
  attachListenerToButton(); // your existing function
  const mo = new MutationObserver(() => attachListenerToButton());
  mo.observe(document.body, { childList: true, subtree: true });

  teardownFns.push(() => mo.disconnect());
  teardownFns.push(() => document.getElementById("print-label-btn")?.remove());
  teardownFns.push(() => {
    // remove data flag
    delete document.documentElement.dataset.tmListingSetup;
  });

  // if you add DOM (modal, styles), store removers here too
}

function teardownPageFeatures() {
  while (teardownFns.length) {
    try { teardownFns.pop()(); } catch (e) {}
  }
  // Clean up any DOM you injected if needed
  // e.g., remove modal/backdrop if it exists
  const modal = document.getElementById('interceptor-modal-backdrop');
  if (modal) modal.remove();
}

// 4) React to URL changes
async function onRouteChange() {
  if (isListingPage()) {
    setupForListing();
  } else {
    teardownPageFeatures();
  }
}

// Run once on initial load, then on every SPA navigation:
onRouteChange();
window.addEventListener('tm-url-change', onRouteChange);



