class BugInfo extends HTMLElement{
  constructor() {
    super();
    let template = document.getElementById('buginfo-template');
    let templateContent = template.content;

    const shadowRoot = this.attachShadow({mode: 'closed'})
      .appendChild(templateContent.cloneNode(true));
  }
  init(){
    this.appendChild(ce("a",{
      slot: "bug-id",
      href: "",
      title: ""
    }));
    this.appendChild(ce("span",{
      slot: "bug-component"
    }));
    this.appendChild(ce("span",{
      slot: "bug-description"
    }));
    return this
  }
  loadFrom(bug){
    this.firstChild.setAttribute("href",`https://bugzilla.mozilla.org/show_bug.cgi?id=${bug.bugid}`);
    this.firstChild.textContent = `#${bug.bugid} ${bug.status[0]}`;
    this.firstChild.setAttribute("title",bug.status);
    this.children[1].textContent = `[${bug.component.replace(/</g,"&lt;")}]`;
    this.children[2].textContent = bug.summary.replace(/</g,"&lt;");
    this.unhide();
  }
  hide(){ this.classList.add("hidden") }
  unhide(){ this.classList.remove("hidden") }
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
  },
  log: function(text){
    let container = document.getElementById("statuslog");
    if(!container){
      return
    }
    let line = ce("div",{"text":text,"class":`logline ${container.children.length & 1?"even":"odd"}`});
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

function getDate(day){
  
let date = (day?new Date(day):new Date()).toISOString().substr(0,10);
  
return {y:date.slice(0,4),m:date.slice(5,7),d:date.slice(8,10)}
}


function isValidDate(str){
  if(!str || typeof str != "string"){
    return false
  }
  else{
    return (/^\d{4,4}-\d{2,2}-\d{2,2}$/).test(str)
  }
}

function restoreUI(b){
  document.getElementById("bugList").classList.remove("busy");
  b.addEventListener("change",populateBugs);
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

function populateBugs(e){
  const b = e ? e.target : document.getElementById("dateSelector");
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
  
  b.removeEventListener("change",populateBugs);
  document.getElementById("bugList").classList.add("busy");
  
  getFile(date)
  .then(res => res, rej => {
    
    if(!e){
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
  let today = getDate();
  let todayStr = `${today.y}-${today.m}-${today.d}`;
  input.setAttribute("max",todayStr);
  let requestedDate = search.get("date");
  if(isValidDate(requestedDate)){
    input.value = requestedDate;
    if(!input.value){
      input.value = todayStr
    }
  }else{
    input.value = todayStr
  }
}

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    setUpDateInput();
    
    populateBugs()
  }
}