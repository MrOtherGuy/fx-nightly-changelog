class BugInfo extends HTMLElement{
  #initDone;
  constructor() {
    super();
  }
  static #fragment = null;
  static get fragment(){
    if(!BugInfo.#fragment){
      let frag = document.getElementById('buginfo-template').content.cloneNode(true);
      for(let i = frag.childNodes.length - 1; i >= 0; --i){
        if(frag.childNodes[i]?.nodeType === 3) { //textnode
          frag.childNodes[i].remove()
        }
      }
      BugInfo.#fragment = frag
    }
    return BugInfo.#fragment
  }
  init(){
    if(this.#initDone){ return this }
    this.classList.add("logline");
    this.append(BugInfo.fragment.cloneNode(true));
    this.#initDone = true;
    return this
  }
  loadFrom(bug){
    let hrefEl = this.firstElementChild;
    hrefEl.setAttribute("href",`https://bugzilla.mozilla.org/show_bug.cgi?id=${bug.bugid}`);
    hrefEl.textContent = `#${bug.bugid} ${bug.status[0]}`;
    hrefEl.setAttribute("title",`${bug.bugid} ${bug.status}`);
    this.children[1].textContent = `[${bug.component}]`;
    this.children[2].textContent = bug.summary;
    this.unhide();
  }
  hide(){ this.hidden = true }
  unhide(){ this.hidden = false }
}

customElements.define('cr-buginfo',BugInfo);

function ce(o,props){
  const el = document.createElement(o);
  for (let p in props){
    p === "text" ? el.textContent = props[p] : el.setAttribute(p,props[p])
  }
  return el
}

const LOG = {
  info:{date:null,cset:null,buildId:null},
  printInfo: function(){
    document.getElementById("buildId").textContent = LOG.info.buildId;
    document.getElementById("changeset").textContent = LOG.info.cset;
    document.getElementById("permalink").href = `?date=${LOG.info.date}`;
  },
  log: function(text){
    let container = document.getElementById("statuslog");
    if(!container){
      return
    }
    let line = ce("div",{"text":text,"class":"logline"});
    container.appendChild(line);
    return
  },
  clear: function(){
    const clear = (a)=>{while(a.children.length){a.removeChild(a.children[0])}};
    clear(document.getElementById("statuslog"));
    return
  },
  error: function(err){
    
    document.getElementById("bugList").classList.add("hideContent");
    
    LOG.info.cset = null;
    LOG.info.buildId = null;
    LOG.printInfo();
    LOG.log(`Error: ${err.errno||err}: ${err.message || ""}`);
    
    return
  },
  setInfo: function(prop,text){
    if(LOG.info.hasOwnProperty(prop)){
      LOG.info[prop] = text;
    }
  }
}

function isValidDate(str){
  if(!str || typeof str != "string"){
    return false
  }
  else{
    return (/^\d{4,4}-\d{2,2}-\d{2,2}$/).test(str)
  }
}

function printData(json){
  LOG.log("Changes to "+json.bugs.length+" bugs - "+json.fixed+" fixed.");
  if(json.restricted){
    LOG.log(json.restricted+" bugs are not inlcuded due to being restricted");
  }
  
  LOG.info.cset = json.cset;
  LOG.info.buildId = json.buildid;
  LOG.info.date = json.date;
  
  let listElement = document.getElementById("bugList");
  const createIndex = listElement.children.length;
  let index = 0;
  for(;index < createIndex && index < json.bugs.length; index++){
    listElement.children[index].loadFrom(json.bugs[index])
  }
  for(;index < json.bugs.length;index++){
    let newItem = document.createElement("cr-buginfo").init();
    newItem.loadFrom(json.bugs[index]);
    listElement.appendChild(newItem);
  }
  for(;index < createIndex; index++){
    listElement.children[index].hide()
  }
  document.getElementById("bugList").classList.remove("hideContent");
}

function getFile(dateString){
  let filename = `${dateString.slice(0,4)}/${dateString.slice(5,7)}/${dateString}.json`;
  return new Promise((resolve,reject) => {
    fetch(`changes/${filename}`)
    .then(response => {
      if(!response.ok){
        reject(`request for "${filename}" got response: ${response.status}`);
        return
      }
      resolve(response.json())
    },err => reject("there was an error making web request: "+err));
  })
}

function restoreUI(b){
  document.getElementById("bugList").classList.remove("busy");
  b.addEventListener("change",onDateChange);
}

function onDateChange(e){
  populateBugs();
}

function populateBugs(tryPreviousDate){
  const b = document.getElementById("dateSelector");
  if(!b || !b.value){ return }
  if(!b.validity.valid){
    LOG.log("requested date" + b.value + " is out of valid range");
    return
  }
  
  LOG.clear();
  
  const date = b.valueAsDate.toISOString().slice(0,10);
  
  if(!isValidDate(date)){
    LOG.log("requested date is invalid");
    return
  }
  
  b.removeEventListener("change",onDateChange);
  document.getElementById("bugList").classList.add("busy");
  
  getFile(date)
  .then(res => res, rej => {
    
    if(tryPreviousDate){
      LOG.log(`No build for ${date}: ${rej}`);
      LOG.log("Trying to load yesterdays build data...");
      b.stepDown();
      return getFile(b.valueAsDate.toISOString().slice(0,10))
      
    }
    throw rej
  })
  .then(printData)
  .then(LOG.printInfo)
  .catch(LOG.error)
  .finally( () => restoreUI(b) )
}

function setUpDateInput(){
  let input = document.getElementById("dateSelector");
  let search = new URLSearchParams(document.location.search);
  let today = (new Date()).toISOString().slice(0,10);
  input.setAttribute("max",today);
  let requestedDate = search.get("date");
  if(isValidDate(requestedDate)){
    input.value = requestedDate;
    if(!input.value){
      input.value = today
    }
  }else{
    input.value = today
  }
  
  function onInputButtonClick(e){
    let input = document.getElementById("dateSelector");
    if(!input.value){
      input.value = input.max;
      populateBugs(true);
      return
    }
    let oldValue = input.value;
    switch (e.target.id){
      case "previousbutton":
        input.stepDown();
        break;
      case "nextbutton":
        input.stepUp();
        break;
      default:
        return;
    }
    if(input.value != oldValue){
      populateBugs();
    }
  }
  
  input.previousElementSibling.addEventListener("click",onInputButtonClick);
  input.nextElementSibling.addEventListener("click",onInputButtonClick);
  
  document.addEventListener("keyup",(ev) => {
    let keys = ["ArrowLeft","ArrowRight"];  
    if(keys.includes(ev.key)){
      let oldValue = input.value;
      if(!oldValue){
        input.value = input.max
      }
      keys.indexOf(ev.key) ? input.stepUp() : input.stepDown();
      input.value != oldValue && populateBugs()   
    }
  });
}

function handleVisibilityChange(ev){
  if (document.visibilityState === "visible") {
    document.getElementById("dateSelector")
    .setAttribute("max",(new Date().toISOString().slice(0,10)))
  }
}

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    setUpDateInput();
    document.getElementById("permalink").addEventListener("click",(e) => {
      e.preventDefault();
      let link = e.target;
      try{
        let url = new URL(link.href);
        let writing = navigator.clipboard.writeText(url.href);
        writing.then(()=>{
          LOG.log("copied url for "+LOG.info.date+" to clipboard");
          link.classList.add("copy-success");
          setTimeout(()=>link.classList.remove("copy-success"),2000);
        });
        
      }catch(e){
        LOG.log(e)
      }
      
    });
    if(document.hidden != undefined){
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    populateBugs(true)
  }
}