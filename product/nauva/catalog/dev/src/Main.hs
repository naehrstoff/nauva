{-# LANGUAGE DuplicateRecordFields #-}
{-# LANGUAGE OverloadedStrings     #-}
{-# LANGUAGE QuasiQuotes           #-}

module Main (main) where


import qualified Text.Blaze.Html5            as H
import qualified Text.Blaze.Html5.Attributes as A

import           Nauva.Server

import           Nauva.Catalog

import           Nauva.Product.Nauva.Catalog (catalogPages)



main :: IO ()
main = do
    runServer $ Config (\routerH -> catalog $ CatalogProps routerH catalogPages) $ do
        H.link H.! A.rel "stylesheet" H.! A.type_ "text/css" H.! A.href "https://fonts.googleapis.com/css?family=Roboto:400,700,400italic"
        H.link H.! A.rel "stylesheet" H.! A.type_ "text/css" H.! A.href "https://fonts.googleapis.com/css?family=Source+Code+Pro:400,700"

        H.style $ mconcat
            [ "*, *:before, *:after { box-sizing: inherit; }"
            , "html { box-sizing: border-box; }"
            , "body { margin: 0; }"
            ]