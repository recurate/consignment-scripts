// ==UserScript==
// @name         Accept and approve button
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Intercepts a specific button click, shows a confirmation modal, and performs an action based on user choice. Handles resource navigation correctly.
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

    // --- DATA CACHE ---
    // Instead of single variables, we store data keyed by the Listing ID.
    // Structure: { "12345": { email: "...", firstName: "...", ... } }
    const listingDataCache = {};

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
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.6); z-index: 9999;
            display: flex; justify-content: center; align-items: center; font-family: sans-serif;
        }
        #interceptor-modal-content {
            background-color: white; padding: 25px; border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3); text-align: center; max-width: 450px;
        }
        #interceptor-modal-content h2 { margin-top: 0; }
        #interceptor-modal-buttons { margin-top: 20px; display: flex; justify-content: center; gap: 15px; }
        #interceptor-modal-buttons button { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
        #interceptor-accept-btn, #interceptor-publish-btn, #interceptor-publish-confirm-btn {
            color: #FFFFFF; padding: 0 20px; background: #000000; margin-right: 5px; border-radius: 20px; text-transform: none;
        }
        #interceptor-cancel-btn, #interceptor-cancel-publish-btn { background-color: #6c757d; color: white; }
        .interceptor-hidden { display: none !important; }
        #resale-price-container { display: flex; align-items: center; justify-content: center; margin-top: 15px; gap: 5px; }
        #resale-price-input, #resale-price-input-publish { width: 100px; padding: 5px; border: 1px solid #ccc; border-radius: 4px; }
        #payout-info { margin-top: 10px; font-size: 14px; color: #555; }
    `);

    // -----------------------------
    // Configuration for changing the consignor info to DVF Vintage's info
    // -----------------------------
    const FIELD_STEPS = [
        {
            buttonSelector: 'p[data-testid="seller-name-header"] button[data-testid="edit-btn"]',
            inputSelector: ['input[name="seller_first_name"]', 'input[name="seller_last_name"]'],
            value: ['DVF', 'Vintage'],
            pressEnter: true,
        },
        {
            buttonSelector: 'p[data-testid="seller-email-header"] button[data-testid="edit-btn"]',
            inputSelector: [ 'input[name="seller_email"]' ],
            value: [ 'dvf@trove.co' ],
            pressEnter: true,
        },
        {
            buttonSelector: 'p[data-testid="seller-phone-header"] button[data-testid="edit-btn"]',
            inputSelector: ['input[name="seller_phone"]'],
            value: ['888-888-8888'],
            pressEnter: true,
        },
        {
            buttonSelector: 'p[data-testid="seller-address-header"] button[data-testid="edit-btn"]',
            inputSelector: [
                'input[name="seller_address_line1"]', 'input[name="seller_address_line2"]',
                'input[name="seller_city"]', 'input[name="seller_state"]',
                'input[name="seller_postal"]', 'input[name="seller_country"]'
            ],
            value: ['872 Washington Street', '', 'New York', 'NY', '10014', 'US'],
            pressEnter: true,
        },
    ];

    // Global timing
    const CHECK_INTERVAL_MS = 200;
    const STEP_TIMEOUT_MS   = 15000;
    const AFTER_CLICK_PAUSE_MS = 150;
    const BETWEEN_STEPS_PAUSE_MS = 200;


    // =====================================================
    // --- Add Modals ---
    // =====================================================
    document.body.insertAdjacentHTML('beforeend', modalAcceptHTML);
    document.body.insertAdjacentHTML('beforeend', modalPublishHTML);

    const acceptModal = document.getElementById('accept-modal-backdrop');
    const publishModal = document.getElementById('publish-modal-backdrop');
    let originalButtonClicked = null;
    let isPublishing = false;
    let currentModalPriceInput;
    let currentModalPayoutSpan;

    // Helper: Extract Listing ID from DOM
    function getListingIdFromScreen() {
        const idElement = document.querySelector('.MuiTypography-root.MuiTypography-body2');
        let idValue = 'Not Found';

        if (idElement && idElement.innerHTML.includes('<br>')) {
            idValue = idElement.innerHTML.split('<br>')[1].trim();
        } else if (idElement) {
            idValue = idElement.textContent.trim();
        }

        if (idValue !== 'Not Found') {
            return idValue.replace('ID:', '').trim();
        }
        return null;
    }

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

        if (currentModalPriceInput) {
            currentModalPriceInput.value = initialPrice > 0 ? initialPrice : '0';
            handlePriceInput();
        }
    }

    function hideModals() {
        if (acceptModal) acceptModal.classList.add('interceptor-hidden');
        if (publishModal) publishModal.classList.add('interceptor-hidden');
        originalButtonClicked = null;
    }

    function classStringToSelector(classStr) {
        return '.' + classStr.trim().replace(/\s+/g, '.');
    }

    // =====================================================
    // --- Utilities for updating seller info ---
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

    function setReactInputValue(inputEl, newValue) {
        const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        const setter = proto && proto.set;
        if (!setter) {
            inputEl.value = newValue;
        } else {
            setter.call(inputEl, newValue);
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function pressEnter(el) {
        const evt = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true,
        });
        el.dispatchEvent(evt);
    }

    async function updateSellerInfo() {
        console.log('[TM] Multi-Field Click & Fill: starting…');
        for (let i = 0; i < FIELD_STEPS.length; i++) {
            const { buttonSelector, inputSelector, value, pressEnter: doEnter } = FIELD_STEPS[i];
            const btn = await waitForElement(buttonSelector).catch(err => {
                console.error(`[TM] Step ${i + 1}: ${err.message}`);
                return null;
            });
            if (!btn) break;

            btn.click();
            await wait(AFTER_CLICK_PAUSE_MS);

            for (let j = 0; j < inputSelector.length; j++) {
                const input = await waitForElement(inputSelector[j]).catch(err => {
                    console.error(`[TM] Step ${i + 1}: ${err.message}`);
                    return null;
                });
                if (!input) break;

                setReactInputValue(input, value[j]);
                if (doEnter) pressEnter(input);
                await wait(BETWEEN_STEPS_PAUSE_MS);
            }
            await wait(BETWEEN_STEPS_PAUSE_MS);
        }
        console.log('[TM] Multi-Field Click & Fill: finished.');
    }

    async function updateListingPrices(price) {
        console.log('[TM] Updating listing prices...');
        const listingPriceInputSelector = 'input[name="listing_price"]';
        const shippingPriceInputSelector = 'input[name="shipping_price"]';

        try {
            const listingPriceInput = await waitForElement(listingPriceInputSelector);
            const shippingPriceInput = await waitForElement(shippingPriceInputSelector);

            if (listingPriceInput) setReactInputValue(listingPriceInput, price * 0.7);
            if (shippingPriceInput) setReactInputValue(shippingPriceInput, price * 0.3);
        } catch (error) {
            console.error('[TM] Failed to update listing prices:', error);
        }
    }

    // =====================================================
    // Main function to intercept the "Approve" button
    // =====================================================

    function interceptClick(event) {
        if (isPublishing) {
            isPublishing = false;
            return;
        }

        const checkbox = document.querySelector('div[data-testid="allow-unmatched-checkbox"] input[type="checkbox"]');
        if (checkbox) {
            if (!checkbox.checked) {
                checkbox.click();
                console.log('"Allow unmatched" checkbox has been checked by simulating a click.');
            }
        }

        event.preventDefault();
        event.stopPropagation();

        console.log("Button click intercepted. Showing modal.");
        originalButtonClicked = event.currentTarget;
        if (originalButtonClicked.id === 'custom-accept-button') {
            showModal('accept');
        } else if (originalButtonClicked.textContent.trim() === 'Publish to Shopify') {
            showModal('publish');
        }
    }

    function handlePriceInput() {
        if (!currentModalPriceInput || !currentModalPayoutSpan) return;
        const value = currentModalPriceInput.value;
        const sanitizedValue = value.replace(/[^0-9.]/g, '');
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
    // --- Modal Button Event Listeners ---
    // =====================================================

    // --- "Accept" consignment button is clicked
    document.getElementById('interceptor-accept-btn').addEventListener('click', async () => {
        console.log("'Accept consignment' clicked.");

        if (!isPriceValid()) {
            alert("Please enter a valid \nresale price greater than $0.");
            return;
        }

        // 1. Get Listing ID currently on screen
        const cleanedId = getListingIdFromScreen();
        if (!cleanedId) {
            alert("Could not determine Listing ID from the page. Please refresh.");
            return;
        }

        // 2. Look up the original consignor data in our CACHE
        const originalData = listingDataCache[cleanedId];

        if (!originalData) {
            console.warn(`[TM] No cached data found for Listing ID: ${cleanedId}`);
            alert(`Error: Original consignor data for Listing ID ${cleanedId} was not captured.\n\nPlease refresh the page to ensure the data is loaded, then try again.`);
            return;
        }

        const resalePrice = currentModalPriceInput.value;
        await updateListingPrices(resalePrice);

        const titleElement = document.querySelector('input[name="listing_title"]');
        const productTitle = titleElement ? titleElement.value : 'DVF Vintage Consignment Piece';


        // --- Call Zapier Webhook ---
        if (zapierAcceptWebhookURL.includes('YOUR/WEBHOOK/URL') || zapierAcceptWebhookURL === '') {
            console.warn('[TM] Zapier URL is not set. Skipping webhook call.');
            alert('Warning: The Zapier webhook URL is not configured in the script.');
        } else {
            try {
                // Use the data from the CACHE, not global variables
                const payload = {
                    originalEmail: originalData.email,
                    originalFirstName: originalData.firstName,
                    originalLastName: originalData.lastName,
                    originalAddress1: originalData.address1,
                    originalAddress2: originalData.address2,
                    originalCity: originalData.city,
                    originalState: originalData.state,
                    originalPostal: originalData.postal,
                    originalPhone: originalData.phone,
                    consignmentPrice: resalePrice,
                    productTitle: productTitle,
                    listingId: cleanedId,
                    sellerId: originalData.sellerId
                };
                console.log('[TM] Sending data to Zapier:', payload);

                GM_xmlhttpRequest({
                    method: "POST",
                    url: zapierAcceptWebhookURL,
                    data: JSON.stringify(payload),
                    headers: { "Content-Type": "application/json" },
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

        // Click the "Save" button after updating prices
        const saveButton = document.querySelector('[data-testid="save-pending-listing-btn"]');
        if (saveButton) {
            saveButton.click();
            console.log("Simulated click on 'Save' button.");
        } else {
            console.warn("Could not find the 'Save' button.");
        }

        alert("We have now generated a shipping label and emailed it to the consignor at " + originalData.email);
        hideModals();
    });

    // --- "Publish to Shopify" button is clicked
    document.getElementById('interceptor-publish-confirm-btn').addEventListener('click', async () => {
        console.log("'Publish' clicked from publish modal.");

        if (!isPriceValid()) {
            alert("Please enter a valid resale price greater than $0.");
            return;
        }

        if (originalButtonClicked) {
            isPublishing = true;
            const resalePrice = currentModalPriceInput.value;
            await updateListingPrices(resalePrice);

            alert("Updating seller information!");

            await updateSellerInfo();

            const cleanedId = getListingIdFromScreen();

            // --- Call Zapier Webhook ---
            if (zapierPublishWebhookURL.includes('YOUR/WEBHOOK/URL') || zapierPublishWebhookURL === '') {
                console.warn('[TM] Zapier Publish URL is not set.');
                alert('Warning: The Zapier Publish webhook URL is not configured.');
            } else {
                try {
                    const payload = {
                        listingId: cleanedId || 'Not Found'
                    };
                    console.log('[TM] Sending data to Zapier Publish:', payload);

                    GM_xmlhttpRequest({
                        method: "POST",
                        url: zapierPublishWebhookURL,
                        data: JSON.stringify(payload),
                        headers: { "Content-Type": "application/json" },
                        onload: function(response) {
                            console.log('[TM] Zapier Publish Webhook Success:', response.responseText);
                        },
                        onerror: function(response) {
                            console.error('[TM] Zapier Publish Webhook Error:', response.statusText);
                        }
                    });
                } catch (err) {
                    console.error('[TM] Error preparing Zapier Publish request:', err);
                }
            }

            originalButtonClicked.click();
            console.log("Original button action is being triggered.");
        }
        hideModals();
    });

    document.getElementById('interceptor-cancel-btn').addEventListener('click', () => {
        hideModals();
    });
    document.getElementById('interceptor-cancel-publish-btn').addEventListener('click', () => {
        hideModals();
    });

    // --- Dynamic Button Detection ---
    function attachListenerToButton() {
        const approveButton = document.querySelector('.fullButton');
        const denyButton = document.querySelector('.outlineButton');

        if (approveButton && denyButton) {
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
                newButton.addEventListener('click', (event) => {
                    interceptClick(event);
                });
                denyButton.parentNode.insertBefore(newButton, approveButton);
            }

            // Change the label of the original 'Approve' button
            if (approveButton.textContent.trim() !== 'Publish to Shopify') {
                approveButton.textContent = 'Publish to Shopify';
                approveButton.dataset.originalLabel = 'Approve';
                approveButton.style.setProperty('padding', '4px 20px', 'important');
                approveButton.style.setProperty('height', 'auto', 'important');
                if (!approveButton.dataset.interceptorAttached) {
                    approveButton.addEventListener('click', interceptClick, true);
                    approveButton.dataset.interceptorAttached = 'true';
                }
            }
        }
    }

    const observer = new MutationObserver((mutations) => {
       attachListenerToButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });

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
    modalObserver.observe(document.body, { childList: true, subtree: true });


    // =====================================================
    // --- Find the original Consignor info & CACHE IT ---
    // =====================================================

    console.log("Fetching the original Consignor info - 1");
    const interceptFetch = () => {
        console.log("Fetching the original Consignor info - 2");
        const originalFetch = unsafeWindow.fetch;

        unsafeWindow.fetch = function(...args) {
            const promise = originalFetch.apply(this, args);
            promise.then(response => {
                if (response.url.includes('/core')) {
                    response.clone().json().then(data => {
                        try {
                            if (data && data.data && Array.isArray(data.data.history.listings) && data.data.history.listings.length > 0) {
                                const lastHistoryItem = data.data.history.listings[data.data.history.listings.length - 1];

                                if (lastHistoryItem && lastHistoryItem.seller_info && lastHistoryItem.seller_info.seller_email) {
                                    // Try to find the unique ID for this listing in the history item
                                    // This ID is used as the key for our cache
                                    const itemId = lastHistoryItem.id || lastHistoryItem.listing_id || lastHistoryItem.listingId;

                                    if (itemId) {
                                        const dictKey = String(itemId).trim();
                                        console.log(`[TM] Caching data for Listing ID: ${dictKey}`);

                                        // Store into our dictionary
                                        listingDataCache[dictKey] = {
                                            email: lastHistoryItem.seller_info.seller_email,
                                            firstName: lastHistoryItem.seller_info.seller_first_name,
                                            lastName: lastHistoryItem.seller_info.seller_last_name,
                                            address1: lastHistoryItem.seller_info.seller_address_line1,
                                            address2: lastHistoryItem.seller_info.seller_address_line2,
                                            city: lastHistoryItem.seller_info.seller_city,
                                            state: lastHistoryItem.seller_info.seller_state,
                                            postal: lastHistoryItem.seller_info.seller_postal,
                                            phone: lastHistoryItem.seller_info.seller_phone,
                                            sellerId: lastHistoryItem.seller_info.seller_id
                                        };
                                    } else {
                                        console.warn("[TM] Found seller info, but could not find a Listing ID to key it with.");
                                    }
                                }
                            }
                        } catch (e) {
                            console.log("Error parsing core JSON or finding email: " + e);
                        }
                    });
                }
            });
            return promise;
        };
        console.log("Fetch interceptor is active.");
    };

    /**
     * This function runs continuously to update the text on the page
     * BUT it only updates if we have the data for the CURRENT listing ID.
     */
    const applyTextReplacement = () => {
        setInterval(() => {
            // 1. Determine which listing we are looking at right now
            const currentId = getListingIdFromScreen();
            if (!currentId) return;

            // 2. Check if we have data for this specific ID
            const data = listingDataCache[currentId];
            if (!data) {
                // We don't have data for this ID yet (maybe user just navigated here and fetch hasn't finished)
                return;
            }

            // Name:
            const targetNameElement = document.querySelector(targetNameSelector);
            if (targetNameElement && targetNameElement.textContent !== 'Original: ' + data.firstName + ' ' + data.lastName) {
                targetNameElement.textContent = 'Original: ' + data.firstName + ' ' + data.lastName;
            }

            // Email:
            const targetEmailElement = document.querySelector(targetEmailSelector);
            if (targetEmailElement && targetEmailElement.textContent !== 'Original: ' + data.email) {
                targetEmailElement.textContent = 'Original: ' + data.email;
            }

            // Address 1:
            const targetAddress1Element = document.querySelector(targetAddress1Selector);
            if (targetAddress1Element && targetAddress1Element.textContent !== 'Original: ' + data.address1) {
                targetAddress1Element.textContent = 'Original: ' + data.address1;
            }

            // Address 2:
            const targetAddress2Element = document.querySelector(targetAddress2Selector);
            if (targetAddress2Element && targetAddress2Element.textContent !== data.address2) {
                targetAddress2Element.textContent = data.address2 + ' ' + data.city + ', ' + data.state + ' ' + data.postal;
            }

            // Phone:
            const targetPhoneElement = document.querySelector(targetPhoneSelector);
            if (targetPhoneElement && targetPhoneElement.textContent !== 'Original: ' + data.phone) {
                targetPhoneElement.textContent = 'Original: ' + data.phone;
            }
        }, CHECK_INTERVAL_MS);
    };

    // --- Init ---
    interceptFetch();
    applyTextReplacement();
    attachListenerToButton();

})();
