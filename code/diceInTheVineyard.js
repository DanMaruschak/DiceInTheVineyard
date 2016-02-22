// Javascript for a Hangouts extension to support playing the Dogs in the Vineyard
// RPG. It uses an RPG to roll digital dice and displays them in both the "control
// panel" of this extension and also overlaid on the user's video feed so the other
// players can also see what you rolled (which can be important for tactical play).

// Global variables.

var HangoutLeftRightMinMargin = 0.079;
var HangoutDieImageScale = 0.07; // a fraction of the hangout width to display a nice-sized die
                                   // (determined empirically, i.e. eyeballed until about same size)
var HangoutDieVertImageScale = undefined; // calculate in init based on aspect ratio.
var HangoutDicePerRow = Math.floor((1.0 - 2*HangoutLeftRightMinMargin) / HangoutDieImageScale);
var HangoutLeftMargin = 0.5 - ((HangoutDicePerRow-1)/2)*HangoutDieImageScale; // they're center-positioned.

var DieImageCache = [{}, {}, {}]; // begin building cache, per-highlight-state
var SumImageCache = {};

var LowerThirdResource = undefined;

var DieCanvasSize = 256;
var renderingcanvas = document.createElement("canvas");
renderingcanvas.height = DieCanvasSize;
renderingcanvas.width = DieCanvasSize;

var diceSources = [];

function initDieImages () {
    //console.log("Begin setting die images");
    for (var d=0; d<diceinputcontainer.childNodes.length; d++) {
        var inputDiv = diceinputcontainer.childNodes[d];
        if (inputDiv.className == "dieinput") {
            var renderFunc = inputDiv.dataset.renderfunction;
            if (renderFunc != undefined) {
                diceSources.push(inputDiv);
                imgs = inputDiv.getElementsByTagName("img");
                for (var i=0; i<imgs.length; i++) {
                    imgs[i].src = eval(renderFunc);
                }
                
                // initialize arrays for image cache.
                //console.log("Init cache for dsize "+inputDiv.dataset.dsize);
                DieImageCache[0][inputDiv.dataset.dsize] = {}
                DieImageCache[1][inputDiv.dataset.dsize] = {}
                DieImageCache[2][inputDiv.dataset.dsize] = {}
            }
        }
        
    }

    var renderFunc = token.dataset.renderfunction;
    if (renderFunc != undefined) {
        diceSources.push(token);
        imgs = token.getElementsByTagName("img");
        for (var i=0; i<imgs.length; i++) {
            imgs[i].src = eval(renderFunc);
        }

        // initialize arrays for image cache.
        //console.log("Init cache for dsize 0 (token)");
        DieImageCache[0][0] = []
        DieImageCache[1][0] = []
        DieImageCache[2][0] = []
    }
    
    clearCanvas();
    dicesumbkgrnd.src = drawCircleHighlight();
    circlesum.currentSum = 0;

    
    //console.log("Aspect ratio="+gapi.hangout.layout.getVideoCanvas().getAspectRatio());
    HangoutDieVertImageScale = HangoutDieImageScale * gapi.hangout.layout.getVideoCanvas().getAspectRatio();

    gapi.hangout.av.setLocalParticipantVideoMirrored(mirrorlocalvideo.checked);

    changeResizePreventer();    
}

var ResizePreventerResource = undefined;
var ResizePreventerOverlay = undefined;
var ResizePreventerSrc = undefined;
function changeResizePreventer() {
    if (ResizePreventerSrc == undefined) {
        clearCanvas();
        ResizePreventerSrc = renderingcanvas.toDataURL();
    }
    
    if (preventvideoresizing.checked) {
        if (ResizePreventerResource == undefined) {
            ResizePreventerResource = gapi.hangout.av.effects.createImageResource(ResizePreventerSrc);
            ResizePreventerOverlay = ResizePreventerResource.createOverlay({scale : {magnitude: HangoutDicePerRow * HangoutDieImageScale,
                                                                  reference: gapi.hangout.av.effects.ScaleReference.WIDTH}});
        }
        ResizePreventerOverlay.setPosition(0, 0);
        ResizePreventerOverlay.setVisible(true);
    } else {
        if (ResizePreventerResource != undefined) {
            ResizePreventerOverlay.setVisible(false);
            ResizePreventerResource.dispose();
            ResizePreventerOverlay = undefined;
            ResizePreventerResource = undefined;
        }
    }
    
}


// incrementor/decrementor on the input field for how many of each dice to roll.
function dRequestChange(field, amount) {
    var f = document.getElementById(field)
    f.value =  Math.min(99, Math.max(parseInt(f.value) + amount, 0));
}

// user left-clicked on a die, update its state
function detectDieClick(event) {
    event = event || window.event;
    t = event.target;
    
    while (t.className != "individualdie") {
        t = t.parentNode;
        if (t == null) {
            return;
        }
    }
    
    cycleState(t);
}

// cycle between blank, circle, and X. Represent state with image overlay.
function cycleState(obj) {
    //console.log("I need to cycle the state of" + obj + " from " + obj.dieState);
    obj.dieState = (obj.dieState+1)%3;
    obj.src = getDieImage(obj.dieSize, obj.dieResult, obj.dieState);
    obj.hangoutResource.dispose();
    obj.hangoutResource = gapi.hangout.av.effects.createImageResource(obj.src);
    obj.hangoutOverlay = obj.hangoutResource.createOverlay({scale : {magnitude: HangoutDieImageScale,
                                                        reference: gapi.hangout.av.effects.ScaleReference.WIDTH}});
    obj.hangoutOverlay.setPosition(obj.hangoutPosX, obj.hangoutPosY);
    obj.hangoutOverlay.setVisible(true);

    updateCircleSum();
}

function updateCircleHighlightDisplay() {
    if (displaysum.checked) {
        dicesumlabel.childNodes[1].textContent = "Sum";
    } else if (displaycount.checked) {
        dicesumlabel.childNodes[1].textContent = "Count";
    } else {
        dicesumlabel.childNodes[1].textContent = "?????";
    }

    updateCircleSum();
}

// Adds up the result of all dice in the "circle" state and displays that sum
// (Useful for indicating a "Raise" or "See" in a DITV conflict)
function updateCircleSum() {
    var sum = 0;
    for (var i=0; i<dicepool.childNodes.length; i++) {
        if (dicesumactive.checked && dicepool.childNodes[i].dieState == 1) {
            if (displaysum.checked) {
                sum += dicepool.childNodes[i].dieResult;                
            } else if (displaycount.checked) {
                sum += 1; // 
            }
        }
    }
    
    if (sum != circlesum.currentSum) {
        circlesumimg.src = getSumImage(sum);
        if (sum > 0) {
            circlesumimg.visible = true;
            
            if (circlesum.hangoutResource != undefined) {
                circlesum.hangoutResource.dispose();
                circlesum.hangoutResource = undefined;
            }

            //console.log("Create Hangout resource to display " + sum);
            circlesum.hangoutResource = gapi.hangout.av.effects.createImageResource(circlesumimg.src);
            circlesum.hangoutOverlay = circlesum.hangoutResource.createOverlay({scale : {magnitude: HangoutDieImageScale*2,
                                                                  reference: gapi.hangout.av.effects.ScaleReference.WIDTH}});
            //circlesum.hangoutOverlay.setPosition(0.33333, 0.43);
            circlesum.hangoutOverlay.setPosition(0.234, 0.43);
            circlesum.hangoutOverlay.setVisible(true);

        } else {
            circlesumimg.visible = false;
            if (circlesum.hangoutResource != undefined) {
                circlesum.hangoutResource.dispose();
                circlesum.hangoutResource = undefined;
            }
        }
        circlesum.currentSum = sum;
    }    
}

function popCircleSumToTop() {
    circlesum.hangoutResource.dispose();
    circlesum.currentSum = undefined;
    updateCircleSum();
}

function getSumImage(s) {
    // see if it's cached, if so use that, otherwise generate it and populate the cache.
        
    var dataURL = SumImageCache[s]
    
    if (dataURL == undefined) {
        clearCanvas();

        var context = renderingcanvas.getContext("2d");    
        context.lineJoin = "round";
        context.lineCap = "round";
        context.strokeStyle = "#00FF00";
        context.fillStyle = "#FFFFFF";
        context.lineWidth = 10;

        context.beginPath();
        context.arc(0.5*DieCanvasSize, 0.5*DieCanvasSize, 0.45*DieCanvasSize, 0, 2*Math.PI);
        context.fill();
        context.stroke();
 
        context.strokeStyle = "#000000";
        context.fillStyle = "#000000";
        context.font="144px Helvetica";
        context.textBaseline = "middle";
        var tMeasure = context.measureText(s);
        context.fillText(s, 0.5*DieCanvasSize-0.5*tMeasure.width, 0.5*DieCanvasSize);
        
        dataURL = renderingcanvas.toDataURL();
        
        SumImageCache[s] = dataURL;
    }

    return dataURL;    
}

// Roll a die into the pool.
// Dice are represented by divs, with three extra attributes:
//  dieSize   -- the size/shape of the die
//  dieResult -- the number currently showing on the die
//  dieState -- whether the die has been highlighted with an O or X
//
//  die image is displayed via an img element added to the dicepool div and
//  a corresponding Hangouts overlay.
function addDie(dieSize, dieResult, dieState) {
    if (dieState == undefined) {dieState = 0;}
    
    var newdie = document.createElement("img");
    newdie.height = 60;
    newdie.width = 60;
    newdie.dieSize = dieSize;
    newdie.dieResult = dieResult;
    newdie.dieState = dieState;
    
    newdie.className = "individualdie";
    newdie.src = getDieImage(dieSize, dieResult, dieState);
        
    // register mouse event handler
    newdie.onclick = detectDieClick;
        
    // put the die into the dicepool div    
    dicepool.appendChild(newdie);
    
    // now add a corresponding image to the Hangouts video feed.
    var dIndex = dicepool.childNodes.length - 1; // we just added onto the end.
    calculateOverlayPosition(newdie, dIndex);
    
    // do the API stuff to get the image overlaid on the video.
    newdie.hangoutResource = gapi.hangout.av.effects.createImageResource(newdie.src);
    newdie.hangoutOverlay = newdie.hangoutResource.createOverlay({scale : {magnitude: HangoutDieImageScale,
                                                                  reference: gapi.hangout.av.effects.ScaleReference.WIDTH}});
    newdie.hangoutOverlay.setPosition(newdie.hangoutPosX, newdie.hangoutPosY);
    newdie.hangoutOverlay.setVisible(true);
}

function calculateOverlayPosition(die, index) {
    var column = index % HangoutDicePerRow;
    var row = Math.floor(index / HangoutDicePerRow);
    die.hangoutPosX = -0.5 + HangoutLeftMargin + column * HangoutDieImageScale;
    die.hangoutPosY = -0.5 + (row+0.5)*HangoutDieVertImageScale; // offset by half due to center-based positioning.
}

function getDieImage(dieSize, dieResult, dieState) {
    // see if it's cached, if so use that, otherwise generate it and populate the cache.
    
    var dataURL = DieImageCache[dieState][dieSize][dieResult]
    var textSize = undefined;
    
    if (dataURL == undefined) {
        for (var i=0; i<diceSources.length; i++) {
            if (diceSources[i].dataset.dsize == dieSize) {
                dataURL = eval(diceSources[i].dataset.renderfunction);
                if (diceSources[i].dataset.dtextsize != undefined) {
                    textSize = diceSources[i].dataset.dtextsize;
                }
            }
        }
        
        dataURL = drawText(dieResult, textSize);
        
        if (dieState == 1) {
            dataURL = drawCircleHighlight();
        } else if (dieState == 2) {
            dataURL = drawXHighlight();
        }
        
        DieImageCache[dieState][dieSize][dieResult] = dataURL;
    }

    return dataURL;    
}

function drawDieOntoContext(context, vertices, polyList) {
    context.lineJoin = "round";
    context.lineCap = "round";
    context.fillStyle = "#FFFFFF";
    context.strokeStyle = "#ECECEC";
    context.lineWidth = 10;
    
    for (i=0; i<polyList.length; i++) {
        p = polyList[i]; // ordered list of vertices
        
        x = vertices[p[0]][0];
        y = vertices[p[0]][1];
        
        context.beginPath();
        context.moveTo(DieCanvasSize*x, DieCanvasSize*y);
        for (v=1; v<polyList.length; v++) {
            x = vertices[p[v]][0];
            y = vertices[p[v]][1];
            context.lineTo(DieCanvasSize*x, DieCanvasSize*y);
        }
        context.closePath();
        context.fill();
        context.stroke();

        context.fillStyle = "#F9F9F9";
    }
    
}

function drawDiePolygon(vertices, polyList) {
    var context = renderingcanvas.getContext("2d");
    context.clearRect(0, 0, renderingcanvas.width, renderingcanvas.height);
    
    context.lineJoin = "round";
    context.lineCap = "round";
    context.fillStyle = "#FFFFFF";
    context.strokeStyle = "#ECECEC";
    context.lineWidth = 10;

    for (i=0; i<polyList.length; i++) {
        p = polyList[i]; // ordered list of vertices
        
        x = vertices[p[0]][0];
        y = vertices[p[0]][1];
        
        context.beginPath();
        context.moveTo(DieCanvasSize*x, DieCanvasSize*y);
        for (v=1; v<p.length; v++) {
            x = vertices[p[v]][0];
            y = vertices[p[v]][1];
            context.lineTo(DieCanvasSize*x, DieCanvasSize*y);
        }
        context.closePath();
        context.fill();
        context.stroke();

        context.fillStyle = "#F9F9F9";
    }

    var dataURL = renderingcanvas.toDataURL();
    return dataURL;
}

function drawToken() {
    var context = renderingcanvas.getContext("2d");
    context.clearRect(0, 0, renderingcanvas.width, renderingcanvas.height);
    
    context.save();
    
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#ECECEC";
    context.lineWidth = 10;

    context.scale(1,0.719);
    
    // make the vertical side of the token.
    context.beginPath();
    context.fillStyle = "#F9F9F9";
    context.rect(0.5*DieCanvasSize - 0.366667*DieCanvasSize, 0.5*DieCanvasSize/0.719, 2*0.366667*DieCanvasSize, 0.1*DieCanvasSize/0.719);
    context.fill();
    context.stroke();
    
    // make the rounded side of the token.
    context.beginPath();
    context.arc(0.5*DieCanvasSize, (0.5*DieCanvasSize+0.1*DieCanvasSize)/0.719-5, 0.366667*DieCanvasSize, 0, Math.PI);
    context.fill();
    context.stroke();

    // make the top of the token.
    context.fillStyle = "#FFFFFF";
    context.beginPath();
    context.arc(0.5*DieCanvasSize, 0.5*DieCanvasSize/0.719, 0.366667*DieCanvasSize, 0, 2*Math.PI);
    context.fill();
    context.stroke();

    context.restore();
    
    var dataURL = renderingcanvas.toDataURL();
    return dataURL;    
}

function drawCircleHighlight() {
    var context = renderingcanvas.getContext("2d");    
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#00FF00";
    context.lineWidth = 10;

    context.beginPath();
    context.arc(0.5*DieCanvasSize, 0.5*DieCanvasSize, 0.45*DieCanvasSize, 0, 2*Math.PI);
    context.stroke();
 
    var dataURL = renderingcanvas.toDataURL();
    return dataURL;
}

function drawXHighlight() {
    var context = renderingcanvas.getContext("2d");
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "#000000";
    context.lineWidth = 10;

    context.beginPath();
    context.moveTo(0.1*DieCanvasSize, 0.1*DieCanvasSize);
    context.lineTo(0.9*DieCanvasSize, 0.9*DieCanvasSize);
    context.stroke();
    context.beginPath();
    context.moveTo(0.9*DieCanvasSize, 0.1*DieCanvasSize);
    context.lineTo(0.1*DieCanvasSize, 0.9*DieCanvasSize);
    context.stroke();
    
    var dataURL = renderingcanvas.toDataURL();
    return dataURL;    
}

function drawText(textToDraw, size) {
    if (size == undefined) {
        size = 0.305;
    }
    fontSize = Math.round(size*256);
    
    var context = renderingcanvas.getContext("2d");
    context.strokeStyle = "#000000";
    context.fillStyle = "#000000";
    context.font=fontSize+"px Helvetica";
    //console.log("Drawing text with font "+context.font);
    context.textBaseline = "middle";
    tMeasure = context.measureText(textToDraw);
    context.fillText(textToDraw, 0.5*DieCanvasSize-0.5*tMeasure.width, 0.5*DieCanvasSize);

    var dataURL = renderingcanvas.toDataURL();
    return dataURL;
}

function clearCanvas() {
    var context = renderingcanvas.getContext("2d");
    context.clearRect(0, 0, renderingcanvas.width, renderingcanvas.height);    
}

// figure out how many dice of each type to roll, and then roll them.
// die sizes are figured out from the names of the divs that have the UI for each die
function rollDiceIntoPool() {
    var diceInputContainer = document.getElementById("diceinputcontainer");
    for (var i=0; i<diceInputContainer.childNodes.length; i++) {
        var di = diceInputContainer.childNodes[i]
        if (di.className == "dieinput") {
            var dieSize = di.dataset.dsize;
            var numToRoll = 0;
            for (var j=0; j<di.childNodes.length; j++) {
                if (di.childNodes[j].className == "dnumdie") {
                    numToRoll = di.childNodes[j].value;
                    di.childNodes[j].value = 0;
                    break;
                }
            }
            
            for (r=0; r<numToRoll; r++) {
                var dieResult = Math.floor(dieSize*Math.random())+1;
                if ((autohighlight.checked) && (dieResult >= parseInt(autohighlightthreshold.value))) {
                    addDie(dieSize, dieResult, 1); 
                } else {
                    addDie(dieSize, dieResult);
                }
            }
        }
    }
    updateCircleSum();
}

// remove all dice from the pool
function clearPool() {
    while (dicepool.childNodes.length > 0) {
        dicepool.childNodes[0].hangoutResource.dispose();
        dicepool.removeChild(dicepool.childNodes[0]);
    }
    updateCircleSum();
}

// helper function to sort an array of dice
function dicesort(a, b) {
    return b.dieResult - a.dieResult;
}

// Sorting the dice in the pool.
//   First, make a list of what's in there by popping dice out of the pool but
//   pushing their vital info onto a temporary array.
//   Second, sort the temporary array.
//   Third, iterate through temp array and put corresponding dice into the pool.
function sortPool() {
    var diceArray = [];
    while (dicepool.childNodes.length > 0) {
        var n = dicepool.childNodes[0];
        diceArray.push(n);
        dicepool.removeChild(n);
    }
    diceArray.sort(dicesort);
    for (var i=0; i<diceArray.length; i++) {
        //addDie(diceArray[i][0], diceArray[i][1], diceArray[i][2]);
        d = diceArray[i]
        dicepool.appendChild(d);
        calculateOverlayPosition(d, i);
        d.hangoutOverlay.setPosition(d.hangoutPosX, d.hangoutPosY);
    }
}

// Selectively remove dice in the "X" state from the pool.
// First make a list then delete, so we don't have to worry about the list
//   changing while we're iterating through it.
function removeXsFromPool() {
    var nodesToDelete = [];
    for (var i=0; i<dicepool.childNodes.length; i++) {
        if (dicepool.childNodes[i].dieState == 2) {
            nodesToDelete.push(dicepool.childNodes[i]);
            dicepool.childNodes[i].hangoutResource.dispose();
        }
    }
    for (var i=0; i<nodesToDelete.length; i++) {
        dicepool.removeChild(nodesToDelete[i]);
    }
    
    for (var i=0; i<dicepool.childNodes.length; i++) {
        var d = dicepool.childNodes[i];
        calculateOverlayPosition(d, i);
        d.hangoutOverlay.setPosition(d.hangoutPosX, d.hangoutPosY);
    }
}

// A function to add a special "0-sided die" to the pool.
// Helpful for seeding "dice" into the conflict, e.g. when you're in a followup
// conflict and you "gave" to end the previous one.
function addTokenToPool() {
    var v = parseInt(numberontoken.value);
    if (v > 0) {
        if ((autohighlight.checked) && (v >= parseInt(autohighlightthreshold.value))) {
            addDie(0, v, 1);
        } else {
            addDie(0, v, 0);
        }
    }
    numberontoken.value = "";
}

// Can be helpful for stuff like showing your character's name on screen.
function changeLowerThird() {
    if (lowerthirdactive.checked) {

        if (LowerThirdResource != undefined) {
            LowerThirdResource.dispose();
            LowerThirdResource = undefined;
        }
        
        var thirdCanvas = document.createElement("canvas");
        thirdCanvas.width = 850;
        thirdCanvas.height = 63;
        context = thirdCanvas.getContext("2d");
        
        context.fillStyle = lowerthirdmaincolor.value;
        context.fillRect(63, 0, 687, 42);
        
        context.fillStyle = lowerthirdsubcolor.value;
        context.fillRect(74, 37, 665, 26);
        
        context.strokeStyle = "#000000";
        context.fillStyle = "#000000";
        context.font="32px Helvetica";
        context.textBaseline = "top";
        context.fillText(lowerthirdmain.value, 64, 0);
        
        context.font="22px Helvetica";
        context.fillText(lowerthirdsub.value, 75, 37);

        var mainbackgroundsrc = thirdCanvas.toDataURL();
        LowerThirdResource = gapi.hangout.av.effects.createImageResource(mainbackgroundsrc);
        var overlay = LowerThirdResource.createOverlay({scale: {magnitude: 1, reference: gapi.hangout.av.effects.ScaleReference.WIDTH}});

        var aspectRatio = gapi.hangout.layout.getVideoCanvas().getAspectRatio();
        overlay.setPosition(0, 0.5-(thirdCanvas.height/thirdCanvas.width * aspectRatio)/2);
        overlay.setVisible(true);
        
        popCircleSumToTop();
    } else {
        if (LowerThirdResource != undefined) {
            LowerThirdResource.dispose();
            LowerThirdResource = undefined;
        }
    }
}

// Normally Hangouts "mirrors" your local video to you, because most people find it
// disorienting to look at themselves in a way that isn't left/right swapped because
// we generally only see ourselves in physical mirrors so that's what we're used to.
// But since this extension puts your dice in your video feed, they'll get mirrored
// too, and reading backwards-text numbers is also not so great. By default shut the
// mirroring off for readable text, but let the user turn it back on if they want.
function changeMirror() {
    gapi.hangout.av.setLocalParticipantVideoMirrored(mirrorlocalvideo.checked);
}
