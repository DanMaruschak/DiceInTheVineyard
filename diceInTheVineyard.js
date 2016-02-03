// Javascript for a Hangouts extension to support playing the Dogs in the Vineyard
// RPG. It uses an RPG to roll digital dice and displays them in both the "control
// panel" of this extension and also overlaid on the user's video feed so the other
// players can also see what you rolled (which can be important for tactical play).

// Global variables.
var dieUniqueId = 0;
var highlightStates = ["BlankHighlight.png", "OHighlight.png", "XHighlight.png"];
var diceImages = {0:"token.png", 4:"d4.png", 6:"d6.png", 8:"d8.png", 10:"d10.png"};


// incrementor/decrementor on the input field for how many of each dice to roll.
function dRequestChange(field, amount) {
    var f = document.getElementById(field)
    f.value =  Math.min(9, Math.max(parseInt(f.value) + amount, 0));
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
    for (var i=0; i<obj.childNodes.length; i++) {
        c = obj.childNodes[i]
        if (c.className == "diehighlight") {
            obj.highlightState = (obj.highlightState + 1) % highlightStates.length;
            c.src = highlightStates[obj.highlightState];
            break;
        }
    }
    updateCircleSum();
}

// Adds up the result of all dice in the "circle" state and displays that sum
// (Useful for indicating a "Raise" or "See" in a DITV conflict)
function updateCircleSum() {
    placesToUpdate = [circlesumlocal, circlesumremote];
    
    var sum = 0;
    for (var i=0; i<dicepool.childNodes.length; i++) {
        if (dicesumactive.checked && dicepool.childNodes[i].highlightState == 1) {
            sum += dicepool.childNodes[i].dieResult;
        }
    }
    if (sum > 0) {
        for (var i=0; i<placesToUpdate.length; i++) {
            placesToUpdate[i].style.backgroundImage = "url(" + highlightStates[1] + ")";
            placesToUpdate[i].innerHTML = sum;
        }
    } else {
        for (var i=0; i<placesToUpdate.length; i++) {
            placesToUpdate[i].style.backgroundImage = "url(" + highlightStates[0] + ")";
            placesToUpdate[i].innerHTML = "";                
        }
    }
}

// Roll a die into the pool.
// Dice are represented by divs, with three extra attributes:
//  dieSize   -- the size/shape of the die
//  dieResult -- the number currently showing on the die
//  highlightState -- whether the die has been highlighted with an O or X
//
//  die image is displayed via the background image of the div
//  die result is shown in text centered in the div
//  die highlight is an img overlaid on top of the other stuff in the div
function addDie(dieSize, dieResult, dieState) {
    if (dieState == undefined) {dieState = 0;}
    var newdie = document.createElement("div");
    newdie.id = "d" + dieUniqueId;
    newdie.dieSize = dieSize;
    newdie.dieResult = dieResult;
    dieUniqueId++;
    
    newdie.className = "individualdie";
    newdie.style.backgroundImage = "url(" + diceImages[dieSize] + ")";

    // register mouse event handler
    newdie.onclick = detectDieClick;
    
    newdie.appendChild(document.createTextNode(dieResult));
    
    newHighlight = document.createElement("img");
    newHighlight.className = "diehighlight";
    newHighlight.src = highlightStates[dieState];
    newdie.highlightState = dieState;
    newdie.appendChild(newHighlight);
    
    // put the die into the dicepool div    
    document.getElementById("dicepool").appendChild(newdie);                    
    
}

// figure out how many dice of each type to roll, and then roll them.
// die sizes are figured out from the names of the divs that have the UI for each die
function rollDiceIntoPool() {
    var diceInputContainer = document.getElementById("diceinputcontainer");
    for (var i=0; i<diceInputContainer.childNodes.length; i++) {
        var di = diceInputContainer.childNodes[i]
        if (di.className == "dieinput") {
            var dieSize = di.id.split('d')[1];
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
                addDie(dieSize, dieResult);
            }
        }
    }
}

// remove all dice from the pool
function clearPool() {
    while (dicepool.childNodes.length > 0) {
        dicepool.removeChild(dicepool.childNodes[0]);
    }
    updateCircleSum();
}

// helper function to sort an array of dice
function dicesort(a, b) {
    return b[1] - a[1];
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
        diceArray.push([n.dieSize, n.dieResult, n.highlightState]);
        dicepool.removeChild(n);
    }
    diceArray.sort(dicesort);
    for (var i=0; i<diceArray.length; i++) {
        addDie(diceArray[i][0], diceArray[i][1], diceArray[i][2]);
    }
}

// Selectively remove dice in the "X" state from the pool.
// First make a list then delete, so we don't have to worry about the list
//   changing while we're iterating through it.
function removeXsFromPool() {
    var nodesToDelete = [];
    for (var i=0; i<dicepool.childNodes.length; i++) {
        if (dicepool.childNodes[i].highlightState == 2) {
            nodesToDelete.push(dicepool.childNodes[i]);
        }
    }
    for (var i=0; i<nodesToDelete.length; i++) {
        dicepool.removeChild(nodesToDelete[i]);
    }
}

// A function to add a special "0-sided die" to the pool.
// Helpful for seeding "dice" into the conflict, e.g. when you're in a followup
// conflict and you "gave" to end the previous one.
function addTokenToPool() {
    var v = parseInt(numberontoken.value);
    if (v > 0) {
        addDie(0, v);
    }
    numberontoken.value = "";
}

// Can be helpful for stuff like showing your character's name on screen.
function changeLowerThird() {
    if (lowerthirdactive.checked) {
        lowerthirdmaindisplay.style.backgroundColor = "blue";
        lowerthirdsubdisplay.style.backgroundColor = "teal";
        lowerthirdmaindisplay.innerHTML = lowerthirdmain.value;
        lowerthirdsubdisplay.innerHTML = lowerthirdsub.value;
    } else {
        lowerthirdmaindisplay.style.backgroundColor = null;
        lowerthirdsubdisplay.style.backgroundColor = null;
        lowerthirdmaindisplay.innerHTML = "";
        lowerthirdsubdisplay.innerHTML = "";                
    }
    
}

// Normally Hangouts "mirrors" your local video to you, because most people find it
// disorienting to look at themselves in a way that isn't left/right swapped because
// we generally only see ourselves in physical mirrors so that's what we're used to.
// But since this extension puts your dice in your video feed, they'll get mirrored
// too, and reading backwards-text numbers is also not so great. By default shut the
// mirroring off for readable text, but let the user turn it back on if they want.
function changeMirror() {
    
}
