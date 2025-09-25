// ==UserScript==
// @name         Display consignor info
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Replaces placeholder text with the seller's email from a network request.
// @author       Trove Recommerce (Adam Siegel)
// @match        https://dashboard.recurate-app.com/dashboard/product/listings/*
// @grant        GM_log
// @grant        unsafeWindow
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/replace-consignor-info.user.js
// @downloadURL  https://raw.githubusercontent.com/recurate/consignment-scripts/refs/heads/main/replace-consignor-info.user.js
// ==/UserScript==

(function() {
    'use strict';


    // --- CONFIGURATION ---
    const targetEmailSelector = 'p[data-testid="seller-email"]';
    const targetNameSelector = 'p[data-testid="seller-name"]';
    const targetAddress1Selector = 'p[data-testid="seller-address-line-1"]';
    const targetAddress2Selector = 'p[data-testid="seller-address-line-2"]';
    const targetPhoneSelector = 'p[data-testid="seller-phone"]';
    const checkInterval = 200; // Check every 200 milliseconds
    // ---------------------

    let foundEmail = null; // This will hold the email we find.
    let foundFirstName = null;
    let foundLastName = null;
    let foundAddress1 = null;
    let foundAddress2 = null;
    let foundCity = null;
    let foundState = null;
    let foundPostal = null;
    let foundPhone = null;

    /**
     * This function intercepts network requests to find the one containing the seller's email.
     * It works by replacing the browser's default 'fetch' function with our own version.
     */
    const interceptFetch = () => {
        const originalFetch = unsafeWindow.fetch; // Store the original fetch function

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
                                    foundEmail = lastHistoryItem.seller_info.seller_email;
                                    foundFirstName = lastHistoryItem.seller_info.seller_first_name;
                                    foundLastName = lastHistoryItem.seller_info.seller_last_name;
                                    foundAddress1 = lastHistoryItem.seller_info.seller_address_line1;
                                    foundAddress2 = lastHistoryItem.seller_info.seller_address_line2;
                                    foundCity = lastHistoryItem.seller_info.seller_city;
                                    foundState = lastHistoryItem.seller_info.seller_state;
                                    foundPostal = lastHistoryItem.seller_info.seller_postal;
                                    foundPhone = lastHistoryItem.seller_info.seller_phone;
                                }
                            }
                        } catch (e) {
                            GM_log('Error parsing "core" JSON or finding email:', e);
                        }
                    });
                }
            });

            // Return the original promise so the website functions normally
            return promise;
        };
        GM_log('Fetch interceptor is active.');
    };

    /**
     * This function runs continuously to update the text on the page once
     * the dynamic email has been found by the fetch interceptor.
     */
    const applyTextReplacement = () => {
        setInterval(() => {
            // Only proceed if we have found the email from the network request
            if (foundEmail === null) {
                return;
            }
            // Name:
            const targetNameElement = document.querySelector(targetNameSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetNameElement && targetNameElement.textContent !== foundFirstName + ' ' + foundLastName) {
                targetNameElement.textContent = 'Consignor: ' + foundFirstName + ' ' + foundLastName;
            }

            // Email:
            const targetEmailElement = document.querySelector(targetEmailSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetEmailElement && targetEmailElement.textContent !== foundEmail) {
                targetEmailElement.textContent = 'Consignor: ' + foundEmail;
            }

            // Address 1:
            const targetAddress1Element = document.querySelector(targetAddress1Selector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetAddress1Element && targetAddress1Element.textContent !== foundAddress1) {
                targetAddress1Element.textContent = 'Consignor: ' + foundAddress1;
            }

            // Address 2:
            const targetAddress2Element = document.querySelector(targetAddress2Selector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetAddress2Element && targetAddress2Element.textContent !== foundAddress2) {
                targetAddress2Element.textContent = foundAddress2 + ' ' + foundCity + ', ' + foundState + ' ' + foundPostal;
            }

            // Phone:
            const targetPhoneElement = document.querySelector(targetPhoneSelector);
            // If we find the target element AND its text is not already our dynamic text...
            if (targetPhoneElement && targetPhoneElement.textContent !== foundPhone) {
                targetPhoneElement.textContent = 'Consignor: ' + foundPhone;
            }
        }, checkInterval);
    };


    // --- SCRIPT EXECUTION ---
    GM_log('Dynamic script starting.');
    interceptFetch(); // Start listening for network requests immediately
    applyTextReplacement(); // Start the loop that will apply the text when ready





})();
