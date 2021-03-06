{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE TemplateHaskell   #-}

module Nauva.Catalog.TH
    ( catalogPage
    , nauvaCatalogPage

    , renderInline
    , renderBlock
    ) where


import           Data.ByteString      (ByteString)
import           Data.Text            (Text)
import qualified Data.Text             as T
import qualified Data.Text.Encoding    as T
import           Data.Conduit
import qualified Data.Conduit.List     as CL
import           Data.Functor.Identity (runIdentity)
import           Data.Yaml

import           Text.Markdown         (def)
import           Text.Markdown.Block
import           Text.Markdown.Inline

import           Language.Haskell.TH         hiding (Inline)
import           Language.Haskell.TH.Quote
import           Language.Haskell.Meta.Parse (parseExp)
import           Instances.TH.Lift ()

import           Nauva.View hiding (Exp)
import           Nauva.Catalog.Elements



markdownBlocks :: ByteString -> [Block [Inline]]
markdownBlocks = markdownBlocksT . T.decodeUtf8

markdownBlocksT :: Text -> [Block [Inline]]
markdownBlocksT = map (fmap $ toInline mempty) . parseMarkdown
  where
    parseMarkdown md = runIdentity (yield md $$ toBlocks def =$ CL.consume)


renderBlock :: Block [Inline] -> Q Exp -- [Q Element]
renderBlock b = case b of
    (BlockPara is) ->
        appE [| \x -> [pageParagraph $ mconcat x] |] (ListE <$> mapM renderInline is)

    (BlockHeading level is) -> case level of
        1 -> appE [| \x -> [pageH2 $ mconcat x] |] (ListE <$> mapM renderInline is)
        2 -> appE [| \x -> [pageH3 $ mconcat x] |] (ListE <$> mapM renderInline is)
        3 -> appE [| \x -> [pageH4 $ mconcat x] |] (ListE <$> mapM renderInline is)
        _ -> appE [| \x -> [pageH4 $ mconcat x] |] (ListE <$> mapM renderInline is)

    (BlockPlainText is) ->
        appE [| mconcat |] (ListE <$> mapM renderInline is)

    (BlockQuote is) ->
        appE [| \x -> [pageBlockquote $ mconcat x] |] (ListE <$> mapM renderBlock is)

    (BlockCode mbType str) -> case mbType of
        Nothing -> [| [pageCodeBlock str] |]
        Just "nauva" -> do
            let pepDef = PageElementProps {pepTitle = Nothing, pepSpan = 6}
            let cspDef = CodeSpecimenProps {cspPEP = pepDef, cspNoSource = False }
            (csp, expr, str2) <- case T.splitOn "---\n" str of
                [str1] -> case parseExp (T.unpack str1) of
                    Left err -> do
                        err1 <- [| div_ [str_ (T.pack err)] |]
                        pure (cspDef, err1, str)
                    Right expr -> pure (cspDef, expr, str1)

                [rawYAML, str1] -> case decodeEither (T.encodeUtf8 rawYAML) of
                        Left yamlErr -> do
                            err1 <- [| div_ [str_ $ T.pack $ show yamlErr] |]
                            pure (cspDef, err1, str1)
                        Right csp -> case parseExp (T.unpack str1) of
                            Left err -> do
                                err1 <- [| div_ [str_ (T.pack err)] |]
                                pure (csp, err1, str)
                            Right expr -> pure (csp, expr, str1)
                _ -> do
                    expr <- [| div_ [str_ "Unrecognized expression"] |]
                    pure (cspDef, expr, str)

            appE [| \c -> [pageElement (cspPEP csp) [codeSpecimen csp c "Haskell" str2]] |] (pure expr)
        Just "hint" -> do
            let blocks = markdownBlocksT str
            children <- ListE <$> mapM renderBlock blocks
            appE [| \x -> [pageHint $ mconcat x] |] (pure children)

        Just "element" -> do
            el <- case parseExp (T.unpack str) of
                Left err -> [| div_ [str_ (T.pack err)] |]
                Right expr -> pure expr

            appE [| (: []) |] (pure el)

        _ -> [| [pageCodeBlock str] |]

    (BlockList Ordered inlineOrBlocks) ->
        appE [| \x -> [pageOL $ mconcat x] |] $ case inlineOrBlocks of
            Left is -> ListE <$> mapM renderInline is
            Right bs -> ListE <$> mapM renderBlock bs

    (BlockList Unordered inlineOrBlocks) ->
        appE [| \x -> [pageUL $ mconcat x] |] $ case inlineOrBlocks of
            Left is -> ListE <$> mapM renderInline is
            Right bs -> ListE <$> mapM renderBlock bs

    (BlockHtml _) ->
        [| [div_ [str_ "TODO: BlockHtml"]] |]

    BlockRule ->
        [| [hr_ []] |]

    (BlockReference _ _) ->
        [| [div_ [str_ "TODO: BlockReference"]] |]


renderInline :: Inline -> Q Exp -- [Q Element]
renderInline i = case i of
    (InlineText str) ->
        [| [str_ str] |]

    (InlineItalic is) ->
        appE [| \x -> [i_ $ mconcat x] |] (ListE <$> mapM renderInline is)

    (InlineBold is) ->
        appE [| \x -> [strong_ $ mconcat x] |] (ListE <$> mapM renderInline is)

    (InlineLink url _title is) ->
        appE [| \x -> [a_ [href_ url] (mconcat x)] |] (ListE <$> mapM renderInline is)

    (InlineCode str) ->
        [| [pageCode [str_ str]] |]

    (InlineHtml _) ->
        [| [str_ "TODO: InlineHtml"] |]

    (InlineImage _ _ _) ->
        [| [str_ "TODO: InlineImage"] |]

    (InlineFootnoteRef _) ->
        [| [str_ "TODO: InlineFootnoteRef"] |]

    (InlineFootnote _) ->
        [| [str_ "TODO: InlineFootnote"] |]


catalogPage :: ByteString -> Q Exp -- Element
catalogPage bs = do
    children <- ListE <$> mapM renderBlock (markdownBlocks bs)

    appE [| pageRoot . mconcat |] (pure children)


nauvaCatalogPage :: QuasiQuoter
nauvaCatalogPage = QuasiQuoter
    { quoteExp  = catalogPage . T.encodeUtf8 . T.pack
    , quotePat  = error "nauvaCatalogPage: quotePat"
    , quoteType = error "nauvaCatalogPage: quoteType"
    , quoteDec  = error "nauvaCatalogPage: quoteDec"
    }
