// ==UserScript==
// @name         Accept and approve button
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Intercepts a specific button click, shows a confirmation modal, and performs an action based on user choice.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/*
// @updateURL    https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/approve-button.user.js
// @downloadURL  https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/approve-button.user.js
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // --- ZAPIER webhook URL ---
    const zapierAcceptWebhookURL = 'https://hooks.zapier.com/hooks/catch/20833124/usmo7yh/';
    const zapierPublishWebhookURL = 'https://hooks.zapier.com/hooks/catch/20833124/us54h9y/';

    // The original Consignor information; before we replace it with DVF Vintage's information.
    let originalEmail = null; // This will hold the email we find.
    let originalFirstName = null;
    let originalLastName = null;
    let originalAddress1 = null;
    let originalAddress2 = null;
    let originalCity = null;
    let originalState = null;
    let originalPostal = null;
    let originalPhone = null;


    // Targets to display the original Consignor info
    const targetEmailSelector = 'p[data-testid="seller-email"]';
    const targetNameSelector = 'p[data-testid="seller-name"]';
    const targetAddress1Selector = 'p[data-testid="seller-address-line-1"]';
    const targetAddress2Selector = 'p[data-testid="seller-address-line-2"]';
    const targetPhoneSelector = 'p[data-testid="seller-phone"]';
    // --- "Accept" Modal HTML and CSS ---
    const modalAcceptHTML = `
        <div id="accept-modal-backdrop" class="interceptor-hidden">
            <div id="interceptor-modal-content">
                <h2>Accept and generate a label</h2>
                <p>Do you want to accept this consignment?
                You will need to generate a shipping label to email to the consignor.</p>
                <div id="resale-price-container">
                    <label for="resale-price-input">Resale price: $</label>
                    <input type="text" id="resale-price-input" placeholder="Sale price">
                </div>
                <div id="payout-info">
                    Consignor will be paid $<span id="payout-amount">0.00</span> when the item sells.
                </div>
                <div id="interceptor-modal-buttons">
                    <button id="interceptor-accept-btn">Accept consignment</button>
                    <button id="interceptor-publish-btn" style="display:none;">Publish to Shopify</button>
                    <button id="interceptor-cancel-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;
    // --- "Publish to Shopify" modal ---
    const modalPublishHTML = `
        <div id="publish-modal-backdrop" class="interceptor-hidden">
            <div id="interceptor-modal-content">
                <h2>Publish to Shopify</h2>
                <p>Please confirm you have inspected the item, confirmed the size, updated the condition, and printed a label.</p>
                <div id="resale-price-container">
                    <label for="resale-price-input-publish">Resale price: $</label>
                    <input type="text" id="resale-price-input-publish" placeholder="Sale price">
                </div>
                <div id="payout-info">
                    Consignor will be paid $<span id="payout-amount-publish">0.00</span> when the item sells.
                </div>
                <div id="interceptor-modal-buttons">
                    <button id="interceptor-publish-confirm-btn">Confirm Publish</button>
                    <button id="interceptor-cancel-publish-btn">Cancel</button>
                </div>
            </div>
        </div>
    `;


    // Use GM_addStyle for robust CSS injection.
    GM_addStyle(`
        #accept-modal-backdrop, #publish-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: sans-serif;
        }
        #interceptor-modal-content {
            background-color: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 450px;
        }
        #interceptor-modal-content h2 {
            margin-top: 0;
        }
        #interceptor-modal-buttons {
            margin-top: 20px;
            display: flex;
            justify-content: center;
            gap: 15px;
        }
        #interceptor-modal-buttons button {
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        #interceptor-accept-btn {
            color: #FFFFFF;
            padding: 0 20px;
            background: #000000;
            margin-right: 5px;
            border-radius: 20px;
            text-transform: none;
        }
        #interceptor-publish-btn {
            color: #FFFFFF;
            padding: 0 20px;
            background: #000000;
            margin-right: 5px;
            border-radius: 20px;
            text-transform: none;
        }
        #interceptor-publish-confirm-btn {
            color: #FFFFFF;
            padding: 0 20px;
            background: #000000;
            margin-right: 5px;
            border-radius: 20px;
            text-transform: none;
        }
        #interceptor-cancel-btn, #interceptor-cancel-publish-btn {
            background-color: #6c757d;
            color: white;
        }
        .interceptor-hidden {
            display: none !important;
        }
        #resale-price-container {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 15px;
            gap: 5px;
        }
        #resale-price-input, #resale-price-input-publish {
            width: 100px;
            padding: 5px;
            border: 1px solid #ccc;
            border-radius: 4px;
        }
        #payout-info {
            margin-top: 10px;
            font-size: 14px;
            color: #555;
        }
    `);

    // -----------------------------
    // Configuration for changing the consignor info to DVF Vintage's info
    // -----------------------------
    // Provide any valid CSS selector.
    // Classes are fine (e.g., ".my-btn"), as are attributes/IDs/etc.
    // Each step: click `buttonSelector`, wait for `inputSelector`, set `value`, (optional) pressEnter.
    const FIELD_STEPS = [
        {
            // Seller name
            buttonSelector: 'p[data-testid="seller-name-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_first_name"]',
                'input[name="seller_last_name"]',
            ],
            value: [
                'DVF',
                'Vintage',
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller email
            buttonSelector: 'p[data-testid="seller-email-header"] button[data-testid="edit-btn"]',
            inputSelector: [ 'input[name="seller_email"]' ],
            value: [ 'dvf@trove.co' ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller phone
            buttonSelector: 'p[data-testid="seller-phone-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_phone"]'
            ],
            value: [
                '888-888-8888'
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
        {
            // Seller address
            buttonSelector: 'p[data-testid="seller-address-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_address_line1"]',
                'input[name="seller_address_line2"]',
                'input[name="seller_city"]',
                'input[name="seller_state"]',
                'input[name="seller_postal"]',
                'input[name="seller_country"]'
            ],
            value:
            [
                '872 Washington Street',
                '',
                'New York',
                'NY',
                '10014',
                'US'
            ],
            pressEnter: true,    // simulate Enter key after setting value
        },
    ];
    // Global timing for updating the seller info fields
    const CHECK_INTERVAL_MS = 200;
    // how often to poll for elements (ms)
    const STEP_TIMEOUT_MS   = 15000;
    // max wait per button or input (ms)
    const AFTER_CLICK_PAUSE_MS = 150;
    // small pause after click, before polling input
    const BETWEEN_STEPS_PAUSE_MS = 200;
    // small pause between steps


    // =====================================================
    // =====================================================
    // =====================================================
    // --- Add the "Accept" and "Publish" modals to the page's body.
    // =====================================================
    // =====================================================
    // =====================================================

    document.body.insertAdjacentHTML('beforeend', modalAcceptHTML);
    document.body.insertAdjacentHTML('beforeend', modalPublishHTML);
    // --- Core Logic ---
    const acceptModal = document.getElementById('accept-modal-backdrop');
    const publishModal = document.getElementById('publish-modal-backdrop');
    let originalButtonClicked = null;
    let isPublishing = false; // Flag to prevent infinite loop
    let currentModalPriceInput;
    let currentModalPayoutSpan;
    // Function to show the correct modal
    function showModal(type) {
        if (type === 'accept') {
            acceptModal.classList.remove('interceptor-hidden');
            publishModal.classList.add('interceptor-hidden');
            currentModalPriceInput = document.getElementById('resale-price-input');
            currentModalPayoutSpan = document.getElementById('payout-amount');
        } else if (type === 'publish') {
            publishModal.classList.remove('interceptor-hidden');
            acceptModal.classList.add('interceptor-hidden');
            currentModalPriceInput = document.getElementById('resale-price-input-publish');
            currentModalPayoutSpan = document.getElementById('payout-amount-publish');
        }

        // Common logic for both modals
        const listingPriceInput = document.querySelector('input[name="listing_price"]');
        const shippingPriceInput = document.querySelector('input[name="shipping_price"]');
        let initialPrice = 0;
        if (listingPriceInput && shippingPriceInput) {
            const listingPrice = parseFloat(listingPriceInput.value);
            const shippingPrice = parseFloat(shippingPriceInput.value);
            if (Math.abs(listingPrice/(listingPrice + shippingPrice) - 0.7) < 0.02 ) {
                initialPrice = listingPrice + shippingPrice;
            } else if (shippingPrice === 10) {
                initialPrice = listingPrice + shippingPrice;
            }
        }

        // Set the pre-populated value
        if (currentModalPriceInput) {
            currentModalPriceInput.value = initialPrice > 0 ?
            initialPrice : '0';
            handlePriceInput(); // Update payout amount based on initial value
        }
    }

    // Function to hide all modals
    function hideModals() {
        if (acceptModal) acceptModal.classList.add('interceptor-hidden');
        if (publishModal) publishModal.classList.add('interceptor-hidden');
        originalButtonClicked = null; // Reset after action
    }

    // Convert class string to a valid CSS selector
    function classStringToSelector(classStr) {
        return '.' + classStr.trim().replace(/\s+/g, '.');
    }


    // =====================================================
    // =====================================================
    // =====================================================
    // --- Utilities for updating the seller info fields ---
    // =====================================================
    // =====================================================
    // =====================================================

    const wait = (ms) => new Promise(res => setTimeout(res, ms));
    function waitForElement(selector, timeoutMs = STEP_TIMEOUT_MS, pollMs = CHECK_INTERVAL_MS) {
        return new Promise((resolve, reject) => {
            const start = performance.now();

            const tryFind = () => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);

                if (performance.now() - start >= timeoutMs) {
                    return reject(new Error(`Timed out waiting for: ${selector}`));
                }
                setTimeout(tryFind, pollMs);
            };

            tryFind();
        });
    }

    // Set a React-controlled seller info input's value properly
    function setReactInputValue(inputEl, newValue) {
        const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        const setter = proto && proto.set;
        if (!setter) {
            inputEl.value = newValue;
        } else {
            setter.call(inputEl, newValue);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        // let React know
    }

    function pressEnter(el) {
        const evt = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
        });
        el.dispatchEvent(evt);
    }

    // --- Function to update the Consignor info with DVF Vintage
    async function updateSellerInfo() {
        console.log('[TM] Multi-Field Click & Fill: starting…');
        for (let i = 0; i < FIELD_STEPS.length; i++) {
            const { buttonSelector, inputSelector, value, pressEnter: doEnter } = FIELD_STEPS[i];
            console.log(`[TM] Step ${i + 1}/${FIELD_STEPS.length}: waiting for button: ${buttonSelector}`);
            const btn = await waitForElement(buttonSelector).catch(err => {
                console.error(`[TM] Step ${i + 1}: ${err.message}`);
                return null;
            });
            if (!btn) break;

            // Click the button to reveal the input
            btn.click();
            console.log(`[TM] Step ${i + 1}: clicked button.`);
            await wait(AFTER_CLICK_PAUSE_MS);

            for (let j = 0; j < inputSelector.length; j++) {
                // Wait for the input to be available
                console.log(`[TM] Step ${i + 1}: waiting for input: ${inputSelector[j]}`);
                const input = await waitForElement(inputSelector[j]).catch(err => {
                    console.error(`[TM] Step ${i + 1}: ${err.message}`);
                    return null;
                });
                if (!input) break;

                // Set value and optionally press Enter
                setReactInputValue(input, value[j]);
                console.log(`[TM] Step ${i + 1}: set input value to "${value[j]}".`);
                if (doEnter) {
                    pressEnter(input);
                    console.log(`[TM] Step ${i + 1}: pressed Enter.`);
                }

                // Small breather between steps
                await wait(BETWEEN_STEPS_PAUSE_MS);
            }

            // Small breather between steps
            await wait(BETWEEN_STEPS_PAUSE_MS);
        }
        console.log('[TM] Multi-Field Click & Fill: finished.');
    }


    // --- Function to update the Seller Price and Shipping Price (i.e., Consignor Payout and DVF Payout)
    async function updateListingPrices(price) {
      console.log('[TM] Updating listing prices...');
      const listingPriceInputSelector = 'input[name="listing_price"]';
      const shippingPriceInputSelector = 'input[name="shipping_price"]';

      try {
          const listingPriceInput = await waitForElement(listingPriceInputSelector);
          const shippingPriceInput = await waitForElement(shippingPriceInputSelector);

          if (listingPriceInput) {
              setReactInputValue(listingPriceInput, price * 0.7);
              console.log(`[TM] Set listing_price to ${price}.`);
          }
          if (shippingPriceInput) {
              setReactInputValue(shippingPriceInput, price * 0.3);
              console.log(`[TM] Set shipping_price to ${price}.`);
          }
      } catch (error) {
          console.error('[TM] Failed to update listing prices:', error);
      }
    }


    // =====================================================
    // =====================================================
    // =====================================================
    // Main function to intercept the "Approve" button
    // =====================================================
    // =====================================================
    // =====================================================

    function interceptClick(event) {
        // If the click was triggered by our script to "Publish", let it go through.
        if (isPublishing) {
            isPublishing = false;
            // Reset the flag
            return;
        }

        // --- Automatically check the "Allow Unmatched" checkbox ---
        // Find the checkbox using its parent's data-testid attribute.
        const checkbox = document.querySelector('div[data-testid="allow-unmatched-checkbox"] input[type="checkbox"]');
        if (checkbox) {
            // Only click it if it's not already checked.
            if (!checkbox.checked) {
                // Calling .click() is more robust for frameworks like React
                // as it triggers the whole event chain the framework expects.
                checkbox.click();
                console.log('"Allow unmatched" checkbox has been checked by simulating a click.');
            } else {
                console.log('"Allow unmatched" checkbox was already checked.');
            }
        } else {
            console.warn('Could not find the "allow unmatched" checkbox.');
        }
        // --- END UPDATED FEATURE ---

        // Prevent the button's original default action
        event.preventDefault();
        event.stopPropagation();

        console.log("Button click intercepted. Showing modal.");
        originalButtonClicked = event.currentTarget; // Store the button that was clicked
        if (originalButtonClicked.id === 'custom-accept-button') {
            showModal('accept');
        } else if (originalButtonClicked.textContent.trim() === 'Publish to Shopify') {
            showModal('publish');
        }
    }

    // --- New Price Input Logic ---
    function handlePriceInput() {
        if (!currentModalPriceInput || !currentModalPayoutSpan) return;
        const value = currentModalPriceInput.value;
        const sanitizedValue = value.replace(/[^0-9.]/g, ''); // Allow decimal points
        currentModalPriceInput.value = sanitizedValue;
        const price = parseFloat(sanitizedValue);
        if (!isNaN(price) && price >= 0) {
            const payout = (price * 0.70).toFixed(2);
            currentModalPayoutSpan.textContent = payout;
        } else {
            currentModalPayoutSpan.textContent = '0.00';
        }
    }

    function isPriceValid() {
        const price = parseFloat(currentModalPriceInput.value);
        return !isNaN(price) && price > 0;
    }


    // =====================================================
    // =====================================================
    // =====================================================
    // --- Modal Button Event Listeners ---
    // =====================================================
    // =====================================================
    // =====================================================

    // --- "Accept" consignment button is clicked

    document.getElementById('interceptor-accept-btn').addEventListener('click', async () => {
        console.log("'Accept consignment' clicked.");

        if (!isPriceValid()) {
            alert("Please enter a valid \nresale price greater than $0.");
            return;
        }

        const resalePrice = currentModalPriceInput.value;
        await updateListingPrices(resalePrice);

        // Get the product's title
        const titleElement = document.querySelector('input[name="listing_title"]');
        const productTitle = titleElement ? titleElement.value : 'DVF Vintage Consignment Piece';

        // Get the listing ID
        const idElement = document.querySelector('.MuiTypography-root.MuiTypography-body2');
        let idValue = 'Not Found';
        if (idElement && idElement.innerHTML.includes('<br>')) {
            // Split the inner HTML by the <br> tag and take the second part.
            idValue = idElement.innerHTML.split('<br>')[1].trim();
        } else if (idElement) {
            // Fallback in case there is no <br> tag.
            idValue = idElement.textContent.trim();
        }

        // Clean the Listing ID value by removing the "ID: " prefix.
        let cleanedId = 'Not Found';
        if (idValue !== 'Not Found') {
            cleanedId = idValue.replace('ID:', '').trim();
        }
        // End of getting the listing ID

        // --- Call Zapier Webhook ---
        if (zapierAcceptWebhookURL.includes('YOUR/WEBHOOK/URL') || zapierAcceptWebhookURL === '') {
            console.warn('[TM] Zapier URL is not set. Skipping webhook call.');
            alert('Warning: The Zapier webhook URL is not configured in the script.');
        } else {
            try {
                const payload = {
                    originalEmail: originalEmail,
                    originalFirstName: originalFirstName,
                    originalLastName: originalLastName,
                    originalAddress1: originalAddress1,
                    originalAddress2: originalAddress2,
                    originalCity: originalCity,
                    originalState: originalState,
                    originalPostal: originalPostal,
                    originalPhone: originalPhone,
                    consignmentPrice: resalePrice,
                    productTitle: productTitle,
                    listingId: cleanedId
                };

                console.log('[TM] Sending data to Zapier:', payload);

                GM_xmlhttpRequest({
                    method: "POST",
                    url: zapierAcceptWebhookURL,
                    data: JSON.stringify(payload),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    onload: function(response) {
                        console.log('[TM] Zapier Webhook Success:', response.responseText);
                    },
                    onerror: function(response) {
                        console.error('[TM] Zapier Webhook Error:', response.statusText);
                        alert('There was an error sending data to Zapier. Check the console.');
                    }
                });

            } catch (err) {
                console.error('[TM] Error preparing Zapier request:', err);
            }
        }
        // --- End Zapier Webhook Call ---

        // Click the "Save" button after updating prices ---
        const saveButton = document.querySelector('[data-testid="save-pending-listing-btn"]');
        if (saveButton) {
            saveButton.click();
            console.log("Simulated click on 'Save' button.");
        } else {
            console.warn("Could not find the 'Save' button with data-testid='save-pending-listing-btn'.");
        }

        // Select the elements using their data-testid attributes
        const addressLine1 = document.querySelector('[data-testid="seller-address-line-1"]');
        const addressLine2 = document.querySelector('[data-testid="seller-address-line-2"]');

        // Construct the text to copy
        let textToCopy = '';
        if (addressLine1 && addressLine1.innerText) {
            textToCopy += addressLine1.innerText.trim();
        }
        if (addressLine2 && addressLine2.innerText) {
            if (textToCopy !== '') {
                textToCopy += ' ';
            }
            textToCopy += addressLine2.innerText.trim();
        }

        if (textToCopy) {
            // Use GM_setClipboard for better reliability in userscripts
            GM_setClipboard(textToCopy);
            console.log("Copied to clipboard:", textToCopy);
            alert("Shippo will now open. The consignor's address is copied to your clipboard.");
            // Simple feedback
        } else {
            console.error("Could not find the address elements to copy text from.");
            alert("Error: Could not find the content to copy.");
        }

        // Open the new URL in a new tab
        window.open('https://apps.goshippo.com/orders/create', '_blank');
        hideModals();
    });


    // --- "Publish to Shopify" button is clicked

    // document.getElementById('interceptor-publish-btn').addEventListener('click', async () => {
    //    console.log("'Publish' clicked.");

    //    if (!isPriceValid()) {
    //        alert("Please enter a valid resale price greater than $0.");
    //        return;
    //    }

    //    if (originalButtonClicked) {
    //        isPublishing = true; // Set the flag to allow the next click
    //        const resalePrice = currentModalPriceInput.value;
    //        await updateListingPrices(resalePrice);

    //        alert("We are now replacing the consignor's name, address, and email with the DVF Vintage information!"); // Simple feedback

            // Update the seller details before approving the listing
    //        await updateSellerInfo();


            // End of updating the seller details
    //        originalButtonClicked.click(); // Programmatically click the original button
    //        console.log("Original button action is being triggered.");
    //    }
    //    hideModals();
    //});


    // --- "Publish to Shopify" button is clicked

    document.getElementById('interceptor-publish-confirm-btn').addEventListener('click', async () => {
        console.log("'Publish' clicked from publish modal.");

        if (!isPriceValid()) {
            alert("Please enter a valid resale price greater than $0.");
            return;
        }

        if (originalButtonClicked) {
            isPublishing = true; // Set the flag to allow the next click
            const resalePrice = currentModalPriceInput.value;
            await updateListingPrices(resalePrice);

            alert("Updating seller information!"); // Simple feedback

            // Update the seller details before approving the listing
            await updateSellerInfo();



            // Get the listing ID
            const idElement = document.querySelector('.MuiTypography-root.MuiTypography-body2');
            let idValue = 'Not Found';
            if (idElement && idElement.innerHTML.includes('<br>')) {
                // Split the inner HTML by the <br> tag and take the second part.
                idValue = idElement.innerHTML.split('<br>')[1].trim();
            } else if (idElement) {
                // Fallback in case there is no <br> tag.
                idValue = idElement.textContent.trim();
            }

            // Clean the Listing ID value by removing the "ID: " prefix.
            let cleanedId = 'Not Found';
            if (idValue !== 'Not Found') {
                cleanedId = idValue.replace('ID:', '').trim();
            }
            // End of getting the listing ID

            // --- Call Zapier Webhook ---
            if (zapierPublishWebhookURL.includes('YOUR/WEBHOOK/URL') || zapierPublishWebhookURL === '') {
                console.warn('[TM] Zapier Publish URL is not set. Skipping webhook call.');
                alert('Warning: The Zapier Publish webhook URL is not configured in the script.');
            } else {
                try {
                    const payload = {
                        listingId: cleanedId
                    };

                    console.log('[TM] Sending data to Zapier Publish:', payload);

                    GM_xmlhttpRequest({
                        method: "POST",
                        url: zapierPublishWebhookURL,
                        data: JSON.stringify(payload),
                        headers: {
                            "Content-Type": "application/json"
                        },
                        onload: function(response) {
                            console.log('[TM] Zapier Publish Webhook Success:', response.responseText);
                        },
                        onerror: function(response) {
                            console.error('[TM] Zapier Publish Webhook Error:', response.statusText);
                            alert('There was an error sending data to Zapier. Check the console.');
                        }
                    });

                } catch (err) {
                    console.error('[TM] Error preparing Zapier Publish request:', err);
                }
            }
            // --- End Zapier Publish Webhook Call ---


            // End of updating the seller details
            originalButtonClicked.click(); // Programmatically click the original button
            console.log("Original button action is being triggered.");
        }
        hideModals();
    });

    document.getElementById('interceptor-cancel-btn').addEventListener('click', () => {
        console.log("Modal cancelled.");
        hideModals();
    });
    document.getElementById('interceptor-cancel-publish-btn').addEventListener('click', () => {
        console.log("Publish Modal cancelled.");
        hideModals();
    });
    // --- Dynamic Button Detection ---
    // We need to watch the page for when the button is added,
    // especially on modern, dynamic websites.
    function attachListenerToButton() {
        const approveButton = document.querySelector('.fullButton');
        const denyButton = document.querySelector('.outlineButton');
        if (approveButton && denyButton) {
            console.log("Found approve and deny button.");
            // Check if the new button has already been added
            if (!document.getElementById('custom-accept-button')) {
                const newButton = document.createElement('button');
                newButton.id = 'custom-accept-button';
                newButton.className = 'MuiButtonBase-root MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorPrimary MuiButton-root MuiButton-text MuiButton-textPrimary MuiButton-sizeMedium MuiButton-textSizeMedium MuiButton-colorPrimary css-1ujsas3';
                newButton.textContent = 'Accept consignment';
                newButton.style.backgroundColor = 'black';
                newButton.style.color = 'white';
                newButton.style.padding = '4px 20px';
                newButton.style.borderRadius = '20px';
                newButton.style.textTransform = 'none';
                // Add event listener to the new button to show the modal
                newButton.addEventListener('click', (event) => {
                    // This function will handle the click and show the modal
                    interceptClick(event);
                });
                // Insert the new button between the Deny and Approve buttons
                denyButton.parentNode.insertBefore(newButton, approveButton);
                console.log("Injected 'Accept consignment' button.");
            } else {
                console.log("Could not find the approve or deny button");
            }

            // Change the label of the original 'Approve' button
            if (approveButton.textContent.trim() !== 'Publish to Shopify') {
                approveButton.textContent = 'Publish to Shopify';
                approveButton.dataset.originalLabel = 'Approve';
                approveButton.style.setProperty('padding', '4px 20px', 'important'); // Match the new button's padding
                approveButton.style.setProperty('height', 'auto', 'important');
                // Attach the original listener to this button.
                if (!approveButton.dataset.interceptorAttached) {
                    approveButton.addEventListener('click', interceptClick, true);
                    // Use capture phase
                    approveButton.dataset.interceptorAttached = 'true';
                    // Mark as attached
                }
                console.log("Updated 'Approve' button to 'Publish to Shopify'.");
            }
        }
    }

    // Use a MutationObserver to efficiently detect when new elements are added to the page.
    const observer = new MutationObserver((mutations) => {
       // A simple check is often enough. For performance, you could inspect mutations more closely.
       attachListenerToButton();
    });
    // Start observing the entire document body for changes.
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    // Use a MutationObserver to attach event listeners to the modal's new elements.
    const modalObserver = new MutationObserver(() => {
        if (document.getElementById('accept-modal-backdrop') && !currentModalPriceInput) {
            const acceptModalContent = document.getElementById('accept-modal-backdrop').querySelector('#interceptor-modal-content');
            if (acceptModalContent) {
                 const input = acceptModalContent.querySelector('#resale-price-input');
                 if (input) input.addEventListener('input', handlePriceInput);
            }


        }
        if (document.getElementById('publish-modal-backdrop') && !currentModalPriceInput) {
             const publishModalContent = document.getElementById('publish-modal-backdrop').querySelector('#interceptor-modal-content');
             if (publishModalContent) {
                const input = publishModalContent.querySelector('#resale-price-input-publish');
                if (input) input.addEventListener('input', handlePriceInput);


            }
        }
    });
    modalObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    // =====================================================
    // =====================================================
    // =====================================================
    // --- Find the original Consignor info and display it in the Dashboard ---
    // =====================================================
    // =====================================================
    // =====================================================


    /**
     * This function intercepts network requests to find the one containing the seller's email.
     * It works by replacing the browser's default 'fetch' function with our own version.
     */


    console.log("Fetching the original Consignor info - 1");
    const interceptFetch = () => {
        console.log("Fetching the original Consignor info - 2");
        const originalFetch = unsafeWindow.fetch;
        // Store the original fetch function

        // Overwrite the global fetch function
        unsafeWindow.fetch = function(...args) {
            // Let the original fetch do its job, and capture the promise it returns
            const promise = originalFetch.apply(this, args);
            // Tap into the promise to inspect the response
            promise.then(response => {
                // We only care about requests for the 'core' data
                if (response.url.includes('/core')) {
                    // Clone the response so we can read it without interfering with the page's code
                    response.clone().json().then(data => {
                        try {
                            // Navigate through the JSON to find the email
                            if (data && data.data && Array.isArray(data.data.history.listings) && data.data.history.listings.length > 0) {
                                const lastHistoryItem = data.data.history.listings[data.data.history.listings.length - 1];
                                if (lastHistoryItem && lastHistoryItem.seller_info && lastHistoryItem.seller_info.seller_email) {
                                    console.log("Found the original Consignor: " + lastHistoryItem.seller_info.seller_email);
                                    originalEmail = lastHistoryItem.seller_info.seller_email;
                                    originalFirstName = lastHistoryItem.seller_info.seller_first_name;
                                    originalLastName = lastHistoryItem.seller_info.seller_last_name;
                                    originalAddress1 = lastHistoryItem.seller_info.seller_address_line1;
                                    originalAddress2 = lastHistoryItem.seller_info.seller_address_line2;
                                    originalCity = lastHistoryItem.seller_info.seller_city;
                                    originalState = lastHistoryItem.seller_info.seller_state;
                                    originalPostal = lastHistoryItem.seller_info.seller_postal;
                                    originalPhone = lastHistoryItem.seller_info.seller_phone;
                                }
                            }
                        } catch (e) {
                            console.log("Error parsing core JSON or finding email: " + e + ". Data: " + data.history.listings);
                        }
                    });
                }
            });
            // Return the original promise so the website functions normally
            return promise;
        };
        console.log("Fetch interceptor is active.");
    };

    /**
     * This function runs continuously to update the text on the page once
     * the dynamic email has been found by the fetch interceptor.
     */
    const applyTextReplacement = () => {
        setInterval(() => {
            // Only proceed if we have found the email from the network request
            if (originalEmail === null) {
                return;
            }

            // Name:
            const targetNameElement = document.querySelector(targetNameSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetNameElement && targetNameElement.textContent !== 'Original: ' + originalFirstName + ' ' + originalLastName) {
                targetNameElement.textContent = 'Original: '
                + originalFirstName + ' ' + originalLastName;
            }

            // Email:
            const targetEmailElement = document.querySelector(targetEmailSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetEmailElement && targetEmailElement.textContent !== 'Original: ' + originalEmail) {

                targetEmailElement.textContent = 'Original: ' + originalEmail;
            }

            // Address 1:
            const targetAddress1Element = document.querySelector(targetAddress1Selector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetAddress1Element && targetAddress1Element.textContent !== 'Original: ' + originalAddress1) {
                targetAddress1Element.textContent = 'Original: ' + originalAddress1;
            }

            // Address 2:
            const targetAddress2Element = document.querySelector(targetAddress2Selector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetAddress2Element && targetAddress2Element.textContent !== originalAddress2) {
                targetAddress2Element.textContent = originalAddress2 + ' ' + originalCity + ', ' + originalState + ' ' + originalPostal;
            }

            // Phone:
            const targetPhoneElement = document.querySelector(targetPhoneSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetPhoneElement && targetPhoneElement.textContent !== 'Original: ' + originalPhone) {
                targetPhoneElement.textContent = 'Original: ' + originalPhone;
            }
        }, CHECK_INTERVAL_MS);
    };
    // --- Find the original Consignor info and replace it in the dashboard ---
    interceptFetch();
    // Start listening for network requests immediately
    applyTextReplacement();
    // Listen for the "Approve" button
    attachListenerToButton();

})();
