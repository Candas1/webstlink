import * as libstlink from './src/lib/package.js';
import WebStlink from './src/webstlink.js';
import { hex_octet, hex_word, hex_octet_array } from './src/lib/util.js';

function fetchResource(url) {
    return new Promise(function(resolve, reject) {
        let xhr = new XMLHttpRequest();
        xhr.responseType = "arraybuffer";
        xhr.addEventListener("load", function() {
            if (this.status != 200) {
                reject(this.status);
            } else {
                resolve(this.response);
            }
        });
        xhr.addEventListener("error", function() {
            reject(this.status);
        });
        xhr.open("GET", url);
        xhr.send();
    });
}

function read_file_as_array_buffer(file) {
    return new Promise(function (resolve, reject) {
        let reader = new FileReader();
        reader.onload = function() {
            resolve(reader.result);
        };
        reader.onerror = function() {
            reject(reader.error);
        };
        reader.readAsArrayBuffer(file);
    });
}

function show_error_dialog(error) {
    let dialog = document.createElement("dialog");
    let header = document.createElement("h1");
    header.textContent = "Uh oh! Something went wrong.";
    let contents = document.createElement("p");
    contents.textContent = error.toString();
    let button = document.createElement("button");
    button.textContent = "Close";

    button.addEventListener("click", (evt) => {
        dialog.close();
    });

    dialog.addEventListener("close", (evt) => {
        dialog.remove();
    });

    dialog.appendChild(header);
    dialog.appendChild(contents);
    dialog.appendChild(document.createElement("br"));
    dialog.appendChild(button);

    document.querySelector("body").appendChild(dialog);

    dialog.showModal();
}

async function pick_sram_variant(mcu_list) {
    // Display a dialog with the MCU variants for the user to pick
    let dialog = document.querySelector("#mcuDialog");
    let tbody = dialog.querySelector("tbody");

    // Remove old entries
    for (let row of tbody.querySelectorAll("tr")) {
        tbody.removeChild(row);
    }

    const columns = [
        ["type", ""],
        ["freq", "MHz"],
        ["flash_size", "KiB"],
        ["sram_size", "KiB"],
        ["eeprom_size", "KiB"],
    ];

    for (let mcu of mcu_list) {
        let tr = document.createElement("tr");
        for (let [key, suffix] of columns) {
            let td = document.createElement("td");
            if (key == "type") {
                let label = document.createElement("label");
                let input = document.createElement("input");
                let text = document.createTextNode(mcu[key] + suffix);

                label.appendChild(input);
                label.appendChild(text);
                input.type = "radio";
                input.name = "mcuIndex";
                input.value = mcu.type;
                input.required = true;

                td.appendChild(label);
            } else {
                td.textContent = mcu[key] + suffix;
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    let submit_promise = new Promise(function (resolve, reject) {
        function on_submit(evt) {
            dialog.removeEventListener('cancel', on_cancel);
            resolve(evt.target.elements["mcuIndex"].value);
        }

        function on_cancel() {
            dialog.removeEventListener('submit', on_submit);
            reject();
        }

        dialog.addEventListener('cancel', on_cancel, { once: true});
        dialog.addEventListener('submit', on_submit, { once: true});
    });

    dialog.showModal();

    // Wait for the user's selection and return it, otherwise
    // return null if they canceled
    try {
        let type = await submit_promise;
        return type;
    } catch (e) {
        return null;
    }
}

function update_debugger_info(stlink, device) {
    let probeInfo = document.getElementById("probeInfo");
    let summary = probeInfo.querySelector("summary");
    let version = "ST-Link/" + stlink._stlink.ver_str;
    summary.textContent = `Debugger - ${version} - Connected`;
    document.getElementById("productName").textContent = device.productName;
    document.getElementById("mfgName").textContent = device.manufacturerName;
    document.getElementById("serialNumber").textContent = device.serialNumber;
}

function update_target_status(status, target = null) {
    let targetInfo = document.getElementById("targetInfo");
    let targetStatus = document.getElementById("targetStatus");

    if (target !== null) {
        let targetType = document.getElementById("targetType");
        targetType.textContent = "- " + target.type + " -";

        // Remove old target fields
        for (let div of targetInfo.querySelectorAll("div")) {
            targetInfo.removeChild(div);
        }
        
        let fields = [
            ["type",        "Type", ""],
            ["core",        "Core", ""],
            ["dev_id",      "Device ID", ""],
            ["flash_size",  "Flash Size", "KiB"],
            ["sram_size",   "SRAM Size", "KiB"],
        ];
        if (target.eeprom_size > 0) {
            fields.push(["eeprom_size", "EEPROM Size", "KiB"]);
        }
        for (let [key, title, suffix] of fields) {
            let div = document.createElement("div");
            div.textContent = title + ": " + target[key] + suffix;
            targetInfo.appendChild(div);
        }
    }

    let haltState = status.halted ? "Halted" : "Running";
    let debugState = "Debugging " + (status.debug ? "Enabled" : "Disabled");

    targetStatus.textContent = `${haltState}, ${debugState}`;
}

function prevent_submission(event) {
    event.preventDefault();
    return false;
}

document.addEventListener('DOMContentLoaded', event => {
    var stlink = null;
    var curr_device = null;

    let log = document.querySelector("#log");
    let logger = new libstlink.Logger(2, log);
    
    let connectButton = document.querySelector("#connect");
    let flashButton = document.querySelector("#flash");

    window.setInterval(function() {
        log.scrollTop = log.scrollHeight;
      }, 500);

    async function read_and_display_memory(explicit = false) {
        if (stlink !== null && stlink.connected) {
            let addr_field = document.getElementById("memoryReadAddress");
            let size_field = document.getElementById("memoryReadSize");
            try {
                var addr = parseInt(addr_field.value, 16);
                var size = parseInt(size_field.value, 10);
            } catch (error) {
                return;
            }
            let memory = await stlink.read_memory(addr, size);
            let memoryContents = document.getElementById("memoryContents");
            memoryContents.textContent = hex_octet_array(memory).join(" ");
        }
    }
    
    flashButton.addEventListener('click', async function (evt) {
        if (stlink !== null && stlink.connected) {
            let addr_field = document.getElementById("flashWriteAddress");
            try {
                var addr = parseInt(addr_field.value, 16);
            } catch (error) {
                return;
            }

            let field = document.getElementById("flashBinaryFile");
            if (field.files.length > 0) {
                let file = field.files[0];
                let data = await read_file_as_array_buffer(file);
                if (!stlink.last_cpu_status.halted) await stlink.halt();

                try {
                    await stlink.flash(addr, data);
                } catch (err) {
                    logger.error(err);
                    show_error_dialog(err);
                }
                finally{
                    setTimeout(read_and_display_memory, 500,true); 
                    await stlink.reset(stlink.last_cpu_status.halted);
                }
            }
        }
    });

    function update_capabilities(status) {
        if (status.debug) {
            if (status.halted) {
                flashButton.disabled = false;
            } else {
                flashButton.disabled = false;
            }
        } else {
            flashButton.disabled = true;
        }
    }
    
    async function on_successful_attach(stlink, device) {
        // Export for manual debugging
        window.stlink = stlink;
        window.device = device;

        // Reset settings
        connectButton.textContent = "Disconnect";

        // Populate debugger info
        update_debugger_info(stlink, device);

        // Add disconnect handler
        navigator.usb.addEventListener('disconnect', function (evt) {
            if (evt.device === device) {
                navigator.usb.removeEventListener('disconnect', this);
                if (device === curr_device) {
                    on_disconnect();
                }
            }
        });

        // Detect attached target CPU
        let target = await stlink.detect_cpu([], pick_sram_variant);

        // Update the UI with detected target info and debug state
        let status = await stlink.inspect_cpu();
        if (!status.debug) {
            // Automatically enable debugging
            await stlink.set_debug_enable(true);
            status = await stlink.inspect_cpu();
        }

        update_target_status(status, target);
        update_capabilities(status);

        // Set the read memory address to the SRAM start
        document.getElementById("memoryReadAddress").value = "0x" + hex_word(target.flash_start);

        // Set the flash write address to the Flash start
        document.getElementById("flashWriteAddress").value = "0x" + hex_word(target.flash_start);
    
        setTimeout(read_and_display_memory, 500,true);
    }

    document.getElementById("memoryReadAddress").addEventListener('change', function (evt) {
        return read_and_display_memory(true);
    });

    document.getElementById("memoryReadSize").addEventListener('change', function (evt) {
        return read_and_display_memory(true);
    });

    function on_disconnect() {
        logger.info("Device disconnected");
        connectButton.textContent = "Connect";

        flashButton.disabled = true;

        let probeInfo = document.getElementById("probeInfo");
        let summary = probeInfo.querySelector("summary");
        summary.textContent = "Debugger - Disconnected";

        document.getElementById("productName").textContent = "";
        document.getElementById("mfgName").textContent = "";
        document.getElementById("serialNumber").textContent = "";
        
        stlink = null;
        curr_device = null;
    }

    if (typeof navigator.usb === 'undefined') {
        logger.error("WebUSB is either disabled or not available in this browser");
        connectButton.disabled = true;
    }
    
    connectButton.addEventListener('click', async function() {
        if (stlink !== null) {
            await stlink.detach();
            on_disconnect();
            return;
        }

        try {
            let device = await navigator.usb.requestDevice({
                filters: libstlink.usb.filters
            });
            logger.clear();
            let next_stlink = new WebStlink(logger);
            await next_stlink.attach(device, logger);
            stlink = next_stlink;
            curr_device = device;
        } catch (err) {
            logger.error(err);
        }

        if (stlink !== null) {
            await on_successful_attach(stlink, curr_device);
        }
    });
});
