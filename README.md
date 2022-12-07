My changes:
* Demo of master branch directly hosted on github pages, so you can run it directly from [here](https://candas1.github.io/webstlink/), you need to enable github pages on the root folder if you fork this repository
* Simplified the demo to only connect, display memory and flash
* Added support for AT32403RCT6 chip from Artery which is a faster clone of STM32F103RCT6

To do:
* Flashing sometimes fails, but succeeds the next time, check the latest fixes in pystlink
* Test if unlock also works on various chips
* Should we be able to set option bytes ? It can be a problem on GD32 chips because of the hardware watchdog (see [Openocd comments](https://github.com/openocd-org/openocd/blob/9501b263e0ae127b012f5c5e3ba5dffcc7daa8d1/src/flash/nor/stm32f1x.c#L875))
* How to keep eeprom emulation data unchanged when flashing ? (eg. erase only before 0x08010000 ? ) 

webstlink
---------
webstlink is a port of [pystlink](https://github.com/pavelrevak/pystlink), using the [WebUSB](https://wicg.github.io/webusb/) API as a backend to control ST-Link/V2 and ST-Link/V2-1 debug probes from the browser.

Check out the live demo [online](https://devanlai.github.io/webstlink/demo/) 

Tested features
---------------
* Reading registers
* Reading memory
* Halt/step/run/reset
* Erasing/writing flash (tested on STM32F103 only)

Dependencies
------------
webstlink depends on [WebUSB](https://caniuse.com/#feat=webusb) and many ES6 features.
For best results, test with Chrome 61 or newer.

Local testing
-------------
You can test locally with any webserver. For a one-liner, run:

    python -m SimpleHTTPServer

and navigate to http://localhost:8000/demo/

Licensing
---------
webstlink is available under the terms of the MIT license, the same as the pystlink project.
