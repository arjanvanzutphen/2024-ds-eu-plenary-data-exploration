async function load() {
  const mapElem = document.querySelector("arcgis-map");
  mapElem.addEventListener("arcgisViewReadyChange", async (event) => {
      const FeatureLayer = await $arcgis.import("esri/layers/FeatureLayer");
      const GraphicsLayer = await $arcgis.import("esri/layers/GraphicsLayer");
      const Graphic = await $arcgis.import("esri/Graphic");
      const FeatureTable = await $arcgis.import("esri/widgets/FeatureTable");
      const ElevationProfile = await $arcgis.import("esri/widgets/ElevationProfile");
      const HighlightHelper = await $arcgis.import(
          "esri/views/draw/support/HighlightHelper"
      );
      const promiseUtils = await $arcgis.import("esri/core/promiseUtils");
      const geometryEngine = await $arcgis.import("esri/geometry/geometryEngine");
      const CustomContent = await $arcgis.import(
          "esri/popup/content/CustomContent"
      );
      const reactiveUtils = await $arcgis.import("esri/core/reactiveUtils");
      const PopupTemplate = await $arcgis.import("esri/PopupTemplate");
      const SketchViewModel = await $arcgis.import(
          "esri/widgets/Sketch/SketchViewModel"
      );

      const webmap = event.target.map;
      const view = event.target.view;
      const parkBoundariesLayer = webmap.allLayers.find(
          (layer) => layer.title === "Swiss National Parks"
      );
      const hikingTrailsChLayer = webmap.allLayers.find(
          (layer) => layer.title === "Route"
      );

      //////////////////////////////////////////////////////
      //  UI stuff
      //////////////////////////////////////////////////////
      const panelEl = document.getElementById("sheet-panel");
      panelEl.addEventListener("calcitePanelClose", () => handlePanelClose());
      const sheetEl = document.getElementById("sheet");
      view.ui.container.classList.remove("calcite-mode-light");
      const parkChip = document.getElementById("park-chip");
      parkChip.addEventListener("click", () => handleSheetOpen());
      
      // Selecting the park
      const parkSelection = document.querySelector("calcite-tile-group");
      parkSelection.addEventListener("calciteTileGroupSelect", () =>
          handleParkSelection()
      );
      const reset = document.getElementById("reset-btn");
      reset.addEventListener("click", () => resetParks());
      const search = document.getElementById("search");
      search.addEventListener("click", () => showSearch());
      const searchComp = document.querySelector("arcgis-search");
      const showCode = document.getElementById("showCodeBtn");
      const codeModal = document.getElementById("code-modal");


      //////////////////////////////////////////////////////
      //  Code editor
      //////////////////////////////////////////////////////
      showCode.addEventListener("click", () => {
        codeModal.open = true;
      });

      const codeEditor8 = document.getElementById("code-8");
        codeEditor8.editorOptions = {
          fontSize: 18,
          readOnly: true
        };

      //////////////////////////////////////////////////////
      //  Search
      //////////////////////////////////////////////////////

      function showSearch() {
          if (searchComp.style.display === "none") {
              searchComp.style.display = "block";
              search.active = true;
          } else {
              searchComp.style.display = "none";
              search.active = false;
          }
      }

      //////////////////////////////////////////////////////
      //  Popup
      //////////////////////////////////////////////////////

      // This custom content element contains the add trail button
      const showTableBtn = new CustomContent({
          creator: (event) => {
              const tableButton = document.createElement("calcite-fab");
              tableButton.style.justifyContent = "right";
              tableButton.textEnabled = true;
              tableButton.text = "Trail";
              tableButton.addEventListener("click", () =>
                  selectRowInTable(event.graphic)
              );
              return tableButton;
          }
      });

      mapElem.popup.dockEnabled = true;
      mapElem.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "bottom-left"
      };
      map.popup.visibleElements = {
          //actionBar: false,
          //closeButton: false,
          collapseButton: false,
          featureNavigation: false,
          //heading: false,
          spinner: false
      };


      //////////////////////////////////////////////////////
      //  Park navigation and cartography
      //////////////////////////////////////////////////////

      let parkBoundariesLayerView, animation, hikingTrailsChLayerView;
      const symbol = {
          type: "simple-fill",
          color: "white",
          outline: null
      };
      const countryGraphicsLayer = new GraphicsLayer({
          blendMode: "destination-in",
          effect: "bloom(250%)"
      });
      webmap.loadAll().then(async () => {
          addWorld();
          mapElem.basemap.baseLayers.add(countryGraphicsLayer);
          parkBoundariesLayerView = await mapElem.whenLayerView(
              parkBoundariesLayer
          );
        
          hikingTrailsChLayerView = await mapElem.whenLayerView(
              hikingTrailsChLayer
          );
                  
          parkBoundariesLayerView.highlightOptions = {
              color: [255, 224, 66, 1],
              haloOpacity: 0.9,
              fillOpacity: 0
          };

      });

      function addWorld(world) {
          world = new Graphic({
              geometry: {
                  type: "extent",
                  xmin: -180,
                  xmax: 180,
                  ymin: -90,
                  ymax: 90
              },
              symbol: {
                  type: "simple-fill",
                  color: "rgba(0, 0, 0, 1)",
                  outline: null
              }
          });
          countryGraphicsLayer.graphics.add(world);
          return world;
      }

      // add a fading animation when user clicks on a country
      function fadeWorld(world) {
          let timer;
          function frame() {
              const symbol = world.symbol.clone();
              symbol.color.a = Math.max(0, symbol.color.a - 0.1);
              world.symbol = symbol;
              if (symbol.color.a > 0) {
                  timer = requestAnimationFrame(frame);
              }
          }
          frame();
          return {
              remove() {
                  cancelAnimationFrame(timer);
              }
          };
      }

      async function handleParkSelection() {
          // Getting the parkname from the heading of the Calcite Tile element to query
          const selectedPark = parkSelection.selectedItems[0].heading;
          let parkFeature = parkMap.get(selectedPark);
          if (!parkFeature) {
              let query = parkBoundariesLayer.createQuery();
              query.returnGeometry = true;
              query.where = `Name = '${selectedPark}'`;

              const results = await parkBoundariesLayer.queryFeatures(query);
              parkFeature = results.features[0];
              hikingTrailsChLayerView.filter = null;          
              parkMap.set(selectedPark, parkFeature);
              parkChip.text = parkFeature.attributes.Name + " National Park";
          }
          table.filterGeometry = parkFeature.geometry;
          applyEffects(parkFeature);
          mapElem.goTo({
              target: parkFeature
          });
          sheetEl.open = false;
          reset.removeAttribute("hidden");
      }

      function applyEffects(feature) {
          const featureFilter = {
              geometry: feature.geometry
          };
          if (hikingTrailsChLayerView) {
            hikingTrailsChLayerView.filter = featureFilter;
          }


          countryGraphicsLayer.graphics.removeAll();
          animation && animation.remove();
          let world = addWorld();
          // add the park boundary to the graphicslayer
          if (feature) {
              feature.symbol = symbol;
              countryGraphicsLayer.graphics.add(feature);
              // add a fade animation to show the highlight effect
              animation = fadeWorld(world);
          }
      }

      function handleSheetOpen() {
          sheetEl.open = true;
          panelEl.closed = false;
      }

      function handlePanelClose() {
          sheetEl.open = false;
      }

      function resetParks() {
          countryGraphicsLayer.graphics.removeAll();
          let world = addWorld();
          parkChip.text = "Featured Parks";
          table.filterGeometry = null;
        
          reset.setAttribute("hidden", true);
      }

      //////////////////////////////////////////////////////
      //  Map selection
      //////////////////////////////////////////////////////

      const graphicsLayer = new GraphicsLayer();
      mapElem.addLayer(graphicsLayer);

      const selectButton = document.getElementById("select-features");
      selectButton.onclick = () =>
          sketchVM.create("polygon", { mode: "freehand" });
      const clearButton = document.getElementById("clear-selection");
      clearButton.onclick = () => table.highlightIds.removeAll();

      function selectRowInTable(feature) {
          if (feature) {
              table.highlightIds.add(feature.getObjectId());
              table.objectIds.add(feature.getObjectId());
          }
      }

      //use sketchViewModel for selection
      const sketchVM = new SketchViewModel({
          layer: graphicsLayer,
          activeFillSymbol: {
              color: [0, 0, 0, 0],
              outline: {
                  style: "dash-dot",
                  color: [255, 140, 0],
                  width: 3
              },
              type: "simple-fill"
          },
          activeVertexSymbol: {
              color: [0, 0, 0, 0],
              outline: null,
              type: "simple-marker"
          },
          vertexSymbol: {
              color: [0, 0, 0, 0],
              outline: null,
              type: "simple-marker"
          },
          view
      });

      // Used to batch select features.
      sketchVM.on("create", async (event) => {
          if (event.state === "complete") {
              const graphic = event.graphic;

              // Remove selection Graphic immediately after drawing is complete.
              graphicsLayer.remove(graphic);

              // Query for all features contained in selection area.
              const features = await queryFeaturesByGeometry(graphic.geometry);
              const objectIds = [];

              features.forEach((feature) => {
                  const oid = feature.getObjectId();

                  // Only include features not already selected.
                  if (!table.highlightIds.includes(oid)) {
                      objectIds.push(oid);
                  }
              });

              // Bulk selection
              table.highlightIds.addMany(objectIds);
              clearButton.disabled = false;
          }
      });

      async function queryFeaturesByGeometry(geometry) {
          const layerView = table.viewModel.layerView;
        
          const query = layerView.createQuery();
          query.outFields = [layer.objectIdField];
          query.geometry = geometry;

          const response = await layerView.queryFeatures(query);

          return response.features.length ? response.features : null;
      }
      const highlights = new HighlightHelper({
          view
      });

      //////////////////////////////////////////////////////
      //  Table setup
      //////////////////////////////////////////////////////
      const components = new Set();
      const elevationProfileMap = new Map();
      const parkMap = new Map();
      const trailsTableTemplate = {
        columnTemplates: [
        {
            type: "field",
            fieldName: "TourNameR",
            label: "Route name",
            width: 140
        },
        {
            type: "column",
            label: "Trail distance (km)",
            fieldName: "distanceColumn", // needs to be unique
            formatFunction: ({ feature, index }) => {
                const distance = geometryEngine
                    .planarLength(feature.geometry, "kilometers")
                    .toFixed(2);
                return distance + " kilometers";
            }
        },
        {
            type: "field",
            fieldName: "TourInfo",
            label: "Route information"
        }
        //{
        //    type: "field",
        //    fieldName: "UNITNAME",
        //    label: "Park"
       // }
        ]
    };

      const groupLayerRouteEtappe = webmap.layers.getItemAt(1);
      const layer = groupLayerRouteEtappe.allLayers.items[1]
      
      const table = new FeatureTable({
          title: () => {
              return table.layer?.title ?? "Provide a layer.";
          },
          description: () => {
              if (table.state === "loaded") {
                  const type = !!table.layer?.isTable ? "Records" : "Features";
                  return `${type}: ${table.size}; Selection: ${table.highlightIds.length}`;
              }
              return "Loading...";
          },
          container: document.getElementById("table"),
          view,
          layer,
          returnGeometryEnabled: true,
          relatedRecordsEnabled: true,
          visibleElements: {
              layerDropdown: true
          },
          menuConfig: {
              items: [
                  {
                      label: "Filter by extent",
                      icon: "extent-filter",
                      clickFunction: function () {
                          table.filterGeometry = mapElem.extent;
                      }
                  },
                  {
                      label: "Remove extent filter",
                      icon: "x",
                      hidden: () => !table.filterGeometry,
                      clickFunction: function () {
                          table.filterGeometry = null;
                      }
                  },
                  {
                      label: "Show selected rows only",
                      hidden: () => table.filterSelectionEnabled,
                      icon: "selected-items-filter",
                      clickFunction: function () {
                          table.filterBySelectionEnabled = true;
                      }
                  },
                  {
                      label: "Show all",
                      hidden: () => !table.filterSelectionEnabled,
                      icon: "selected-items-filter",
                      clickFunction: function () {
                          table.filterBySelectionEnabled = false;
                      }
                  },
                  {
                      label: "Share my trails",
                      iconClass: "esri-icon-right",
                      icon: "share",
                      hidden: () => !table.highlightIds.length,
                      clickFunction: openInstantApp
                  }
              ]
          },
          actionColumnConfig: {
              label: "Go to feature",
              icon: "zoom-to-object",
              callback: (params) => {
                  mapElem.goTo(params.feature);
              }
          },
          tableTemplate: trailsTableTemplate
      });

      const shareTrailsConfig = [
          {
              position: 1,
              objectIds: table?.highlightIds
          },
          {
              position: 2,
              objectIds: table?.highlightIds
          }
      ];

      function openInstantApp() {
          const countdownUrlParam = `updateSections=${encodeURI(
              JSON.stringify(shareTrailsConfig)
          )}`;
          const countdownUrl = `https://jsapi.maps.arcgis.com/apps/instant/countdown/index.html?appid=5bede2bb8c344f0baa464b6e142bc5b0&${countdownUrlParam}`;
          window.open(countdownUrl);
      }
      // Update UI when row selection changes.
      reactiveUtils.on(
          () => table?.highlightIds,
          "change",
          (event) => {
              const count = table.highlightIds.length;
              clearButton.disabled = !count;
          }
      );

      // Change 'tableTemplate' when 'layer' changes
      table.watch("layer", async (newLayer) => {
        debugger  
        highlights.removeAll();
          
          if (newLayer.title === "Hiking trails") {
            
              table.tableTemplate = trailsTableTemplate;
          } else {
              table.tableTemplate = null; // show all fields
          }
      });
      // Highlight feature in the view
      table.on("cell-pointerover", (evt) => {
          if (evt.feature) {
              highlights.add(evt.feature);
          }
      });
      // Remove highlight from feature in view
      table.on("cell-pointerout", (evt) => {
          highlights.removeAll();
      });
      const highlightFunction = promiseUtils.debounce((evt) => {
          return mapElem.hitTest(evt).then(function (response) {
              const candidate = response.results.find(function (result) {
                  return (
                      result.graphic &&
                      result.graphic.layer &&
                      result.graphic.layer === table.layer
                  );
              });
              if (table.rowHighlightIds.length) {
                  table.rowHighlightIds.removeAll();
                  highlights.removeAll();
              }
              if (candidate) {
                  const graphic = candidate.graphic;
                  table.rowHighlightIds.add(graphic.getObjectId());
                  highlights.add(graphic);
              }
          });
      });
      // Highlight feature on hover
      //mapElem.addEventListener("arcgisViewPointerMove",)
      view.on("pointer-move", (evt) => {
          try {
              promiseUtils.ignoreAbortErrors(highlightFunction(evt));
          } catch (e) { }
      });
      // Select feature on click on the view
      view.on("immediate-click", async (evt) => {
          const { results } = await view.hitTest(evt);
          results.forEach(({ graphic }) => {
              // Ensure result exists and is active layer in FeatureTable
              if (!graphic || graphic.layer !== table.layer) {
                  return;
              }
              // Get feature object id and add it to the table's selection.
              const oid = graphic.getObjectId();
              if (table.highlightIds.includes(oid)) {
                  table.highlightIds.remove(oid);
              } else {
                  table.highlightIds.add(oid);
              }
          });
      });
  });
}
load();
