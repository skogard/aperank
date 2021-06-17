require('dotenv').config()
const Datastore = require('nedb')
const fs = require('fs')
const ejs = require('ejs')
const path = require('path')
const basepath = process.env.APEBASE ? process.env.APEBASE : process.cwd()
const stats = {}
const ratio = {}
const traits = {}
try {
  fs.unlinkSync("./rank")
} catch(err) {
  console.error(err)
}
const db = new Datastore({ filename: path.resolve(basepath, "db"), autoload: true })
const rankdb = new Datastore({ filename: "./rank", autoload: true })
db.find({}, (err, docs) => {
  for(let doc of docs) {
    let hasHat = false;
    let hasClothes = false;
    let hasEarring = false;
    for(let { trait_type, value } of doc.metadata.attributes) {
      if (!stats[trait_type]) {
        stats[trait_type] = {}
      }
      if (stats[trait_type][value]) {
        stats[trait_type][value]++;
      } else {
        stats[trait_type][value] = 1;
      }
      traits[trait_type] = (traits[trait_type] ? traits[trait_type] + 1 : 1)
      if (trait_type === "Hat") hasHat = true
      if (trait_type === "Clothes") hasClothes = true
      if (trait_type === "Earring") hasEarring = true
    }
    if (!hasHat) doc.metadata.attributes.push({ trait_type: "Hat", value: "none" })
    if (!hasClothes) doc.metadata.attributes.push({ trait_type: "Clothes", value: "none" })
    if (!hasEarring) doc.metadata.attributes.push({ trait_type: "Earring", value: "none" })
  }


  /***********************************
  *
  * Normalize attributes
  *
  * 1. no hat
  * 2. no clothes
  * 3. no earring
  *
  ***********************************/
  stats.Hat.none = 10000 - traits.Hat
  stats.Clothes.none = 10000 - traits.Clothes
  stats.Earring.none = 10000 - traits.Earring
  console.log("stats = ", stats)

  // transform stats into ratio
  for(let trait_type in stats) {
    ratio[trait_type] = {}
    for(let val in stats[trait_type]) {
      //ratio[trait_type][val] = stats[trait_type][val] / traits[trait_type]
      ratio[trait_type][val] = stats[trait_type][val] / 10000
    }
  }
  console.log("traits = ", traits)
  console.log("Ratio = ", ratio)
  //console.log("stats = ", stats)
  // sort rare traits
  let rareTraitArray = []
  for(let trait_type in ratio) {
    for(let value in ratio[trait_type]) {
      rareTraitArray.push({
        trait_type,
        value,
        score: ratio[trait_type][value]
      })
    }
  }
  rareTraitArray.sort((x, y) => {
    return x.score - y.score
  })
  console.log("rare traitArray = ", rareTraitArray)

  let lowest = 1;
  for(let doc of docs) {
    /**********************************************************
    *
    * The score is computed by multiplying all trait ratios
    *
    **********************************************************/
    delete doc._id
    doc.score = 1;
    for(let { trait_type, value } of doc.metadata.attributes) {
      doc.score *= ratio[trait_type][value]
    }
    if (doc.score < lowest) {
      lowest = doc.score
    }
  }
  docs.sort((x, y) => {
    return x.score - y.score
  })
  /**********************************************************
  *
  * Normalize score by setting the #1 rank as 1.0
  *
  **********************************************************/
  for(let i=0; i<docs.length; i++) {
    let doc = docs[i];
    doc.calculated = doc.score / lowest
    doc.rank = i+1;
  }
  rankdb.insert(docs, (err, newDocs) => {
    console.log("rankdb build complete")
  })
  fs.writeFileSync("stats.json", JSON.stringify(stats))
  fs.writeFileSync("ratio.json", JSON.stringify(ratio))
})
