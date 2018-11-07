const os = require('os')
const path = require('path')
const util = require('util')
const fs = require('@skpm/fs')
const sketch = require('sketch')

const API_ENDPOINT = 'https://www.bing.com'
const action = '/HPImageArchive.aspx'

const { DataSupplier, UI, Settings } = sketch

const SETTING_KEY = 'bing.photo.id'
const FOLDER = path.join(os.tmpdir(), 'com.sketchapp.bing-plugin')

export function onStartup() {
  DataSupplier.registerDataSupplier('public.image', '随机图片', 'SupplyRandomPhoto')
  DataSupplier.registerDataSupplier('public.image', '搜索图片', 'SearchPhoto')
}

export function onShutdown() {
  DataSupplier.deregisterDataSuppliers()
  try {
    fs.rmdirSync(FOLDER)
  } catch (err) {
    console.error(err)
  }
}

export function onSupplyRandomPhoto(context) {
  let dataKey = context.data.key
  const items = util.toArray(context.data.items).map(sketch.fromNative)
  items.forEach((item, index) => setImageFor(item, index, dataKey))
}

export function onSearchPhoto(context) {
  let dataKey = context.data.key
  let searchTerm = UI.getStringFromUser('Search Unsplash for…', 'People').replace(' ', '-').toLowerCase()
  if (searchTerm != 'null') {
    const items = util.toArray(context.data.items).map(sketch.fromNative)
    items.forEach((item, index) => setImageFor(item, index, dataKey, searchTerm))
  }
}

export default function onImageDetails() {
  var selection = sketch.getSelectedDocument().selectedLayers
  if (selection.length > 0) {
    selection.forEach(element => {
      const id = Settings.layerSettingForKey(element, SETTING_KEY) || (
        element.type === 'SymbolInstance' &&
        element.overrides
          .map(o => Settings.layerSettingForKey(o, SETTING_KEY))
          .find(s => !!s)
      )
      if (id) {
        NSWorkspace.sharedWorkspace().openURL(NSURL.URLWithString(`https://unsplash.com/photos/${id}`))
      } else {
        // This layer doesn't have an Unsplash photo set, do nothing.
        // Alternatively, show an explanation of what the user needs to do to make this work…
        UI.message(`To get a random photo, click Data › Unsplash Random Photo in the toolbar, or right click the layer › Data Feeds › Unsplash Random Photo`)
      }
    })
  } else {
    UI.message(`Please select at least one layer`)
  }
}

function setImageFor(item, index, dataKey, searchTerm) {
  let layer
  if (!item.type) {
    // if we get an unknown item, it means that we have a layer that is not yet
    // recognized by the API (probably an MSOvalShape or something)
    // force cast it to a Shape
    item = sketch.Shape.fromNative(item.sketchObject)
  }
  if (item.type === 'DataOverride') {
    layer = item.symbolInstance // or item.override.affectedLayer, but both of them are not really what we need… Check `MSOverrideRepresentation` to get the true size of the affected layer after being resized on the Symbol instance
  } else {
    layer = item
  }

  let width = layer.frame.width
  let height = layer.frame.height
  let resolution = '1920x1200'
  let resolutions = ['240x320', '320x240', '400x240', '480x800', '640x480', '720x1280', '768x1280', '800x480', '800x600', '1024x768', '1280x768', '1366x768', '1920x1080', '1920x1200']

  // get the proper sulution
  for (let i = 0; i < resolutions.length - 1; i++) {
    let arr = resolutions[i].split('x')
    if (width <= arr[0] && height <= arr[1]) {
      resolution = resolutions[i]
      break
    }
  }

  let max = 9
  let min = 1
  let idx = Math.floor(Math.random() * (+max - +min)) + +min
  let url = API_ENDPOINT + action + '?format=js&n=1&mkt=en-US&idx=' + idx
  UI.message('🕑 正在下载…')
  fetch(url)
    .then(response => response.json())
    .then(json => process(json, dataKey, index, item, resolution))
    .catch(e => {
      UI.message('图片下载失败')
      console.error(e)
    })
}

function process(data, dataKey, index, item, resolution) {
  // supply the data
  let url = API_ENDPOINT + '/' + data.images[0].urlbase + '_' + resolution + '.jpg'
  return getImageFromURL(url).then(imagePath => {
    if (!imagePath) {
      // TODO: something wrong happened, show something to the user
      return
    }
    DataSupplier.supplyDataAtIndex(dataKey, imagePath, index)

    // store where the image comes from, but only if this is a regular layer
    if (item.type != 'DataOverride') {
      Settings.setLayerSettingForKey(item, SETTING_KEY, data.id)
    }
    // show the title
    UI.message(data.images[0].title)
  })
}

function getImageFromURL(url) {
  return fetch(url)
    .then(res => res.blob())
    // TODO: use imageData directly, once #19391 is implemented
    .then(saveTempFileFromImageData)
    .catch((err) => {
      console.error(err)
      return context.plugin.urlForResourceNamed('placeholder.png').path()
    })
}

function saveTempFileFromImageData(imageData) {
  const guid = NSProcessInfo.processInfo().globallyUniqueString()
  const imagePath = path.join(FOLDER, `${guid}.jpg`)
  try {
    fs.mkdirSync(FOLDER)
  } catch (err) {
    // probably because the folder already exists
    // TODO: check that it is really because it already exists
  }
  try {
    fs.writeFileSync(imagePath, imageData, 'NSData')
    return imagePath
  } catch (err) {
    console.error(err)
    return undefined
  }
}
