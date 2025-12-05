// ==UserScript==
// @name         Print label button
// @namespace    http://tampermonkey.net/
// @version      1.3
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
  window.addEventListener('hashchange', fire);
})(window.history);

// 2) Route guard — only run on certain paths
function isListingPage() {
  // UPDATED: Check for /listings/ followed by at least one character (the UUID).
  // This ensures it returns FALSE for ".../listings" and TRUE for ".../listings/123"
  return /\/listings\/.+/.test(window.location.pathname);
}


// 3) Setup and teardown so features only exist on target pages
let teardownFns = [];

function setupForListing() {
  // Avoid double-setup
  if (document.documentElement.dataset.tmListingSetup === '1') return;
  document.documentElement.dataset.tmListingSetup = '1';

    // --- 1. Create the Button Element ---
    const extractButton = document.createElement('button');
    extractButton.id = "print-label-btn";
    extractButton.textContent = 'Print label';

    // --- 2. Style the Button ---
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

        // 2. Get the Product Name
        const productNameElement = document.querySelector('input[name="listing_title"]');
        const productName = productNameElement ? productNameElement.value : 'Not Found';

        // 3. Get Option 1
        const option1Element = document.querySelector('input[name="option_value_0"]');
        const option1 = option1Element ? option1Element.value : 'Not Found';

        // 4. Get Option 2
        const option2Element = document.querySelector('input[name="option_value_1"]');
        const option2 = option2Element ? option2Element.value : 'Not Found';

        // 5. Get the Consignor
        const consignorElement = document.querySelector('[data-testid="seller_email"]');
        // Note: variable 'consignor' is extracted but not currently used in the popup HTML below
        const consignor = consignorElement ? consignorElement.textContent.trim() : 'Not Found';


        // --- B. Create and display the popup with the extracted data ---

        // Opens a new, small browser window (a popup).
        const popup = window.open('', 'dataPopup', 'width=384,height=192,scrollbars=yes,resizable=yes');


        // 6. Get and calculate the total price.
        const listingPriceInput = document.querySelector('input[name="listing_price"]');
        const shippingPriceInput = document.querySelector('input[name="shipping_price"]');
        let tagPrice = 0;
        if (listingPriceInput && shippingPriceInput) {
            const listingPrice = parseFloat(listingPriceInput.value) || 0;
            const shippingPrice = parseFloat(shippingPriceInput.value) || 0;
            tagPrice = listingPrice + shippingPrice;
        }

        // Format for display
        const displayPrice = `$${tagPrice.toFixed(2)}`;

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
                    <table>
                       <tr>
                          <td width="50%">
                             <div class="qr-container">
                                <img src="${qrCodeUrl}" alt="QR Code for ID ${cleanedId}" title="QR Code for ID ${cleanedId}">
                             </div>
                          </td>
                          <td width="50%">
                             <h1>Trove License Plate</h1>
                             <p><font size="3em">Price: ${displayPrice}</font></p>
                             <p>${cleanedId}</p>
                             <p>${productName}</p>
                             <p>${option1} / ${option2}</p>
                          </td>
                       </tr>
                    </table>
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
            console.log('Popup was blocked. Please allow popups for this site.');
        }
    }

    // --- 4. Attach the Action to the Button ---
    extractButton.addEventListener('click', openDataPopup);

    // --- 5. Add the Button to the Page ---
    document.body.appendChild(extractButton);

    // OBSERVER: Re-attach if DOM changes (SPA behavior)
    // Note: extractButton is already in the DOM, but if the app re-renders the body content, we might lose it.
    // The previous script had 'attachListenerToButton' here which was undefined.
    // We use a MutationObserver to ensure our specific button stays or logic persists.
    const mo = new MutationObserver(() => {
        if (!document.getElementById("print-label-btn")) {
             document.body.appendChild(extractButton);
        }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Cleanup tasks for when we leave the page
    teardownFns.push(() => mo.disconnect());
    teardownFns.push(() => document.getElementById("print-label-btn")?.remove());
    teardownFns.push(() => {
        delete document.documentElement.dataset.tmListingSetup;
    });
}

function teardownPageFeatures() {
  while (teardownFns.length) {
    try { teardownFns.pop()(); } catch (e) {}
  }
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
